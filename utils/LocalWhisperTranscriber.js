const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');


class LocalWhisperTranscriber {
  constructor(options = {}) {
    this.modelsDir = options.modelsDir || path.join(__dirname, '../whisper_models');
    this.processedDir = options.processedDir || path.join(__dirname, '../processed_audio');
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.modelsDir, this.processedDir].forEach(dir => {
      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async getModelPath(modelName = 'tiny') {
    const modelFile = `ggml-${modelName}.bin`;
    const modelPath = path.join(this.modelsDir, modelFile);
    
    if (fsSync.existsSync(modelPath)) {
      return modelPath;
    }
    
    console.log(`[Whisper] Model ${modelName} not found at ${modelPath}`);
    throw new Error(`Model ${modelName} not found. Download it to: ${modelPath}`);
  }

  async processAudio(audioPath) {
    console.log(`[Whisper] Processing audio file...`);
    
    const processedPath = path.join(
      this.processedDir,
      `${path.basename(audioPath, path.extname(audioPath))}_processed.wav`
    );

    await this.convertAudio(audioPath, processedPath);
    
    console.log(`[Whisper] Audio processed: ${processedPath}`);
    return processedPath;
  }

  async convertAudio(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        '-y', outputPath,
        '-loglevel', 'error'
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg failed with code ${code}`));
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  async transcribeWithFallback(audioPath, options = {}) {
    try {
      console.log(`[Whisper] Starting transcription of ${audioPath}...`);
      
      // Process audio first
      const processedPath = await this.processAudio(audioPath);
      
      let result;
      
      // Try @napi-rs/whisper
      try {
        result = await this.transcribeWithNapiRsWhisper(processedPath, options);
      } catch (error) {
        console.log(`[Whisper] @napi-rs/whisper failed: ${error.message}`);
        
        // Fallback to simple message since no other options
        result = {
          success: false,
          text: `[Transcription not available: ${error.message}]`,
          language: 'unknown',
          error: error.message
        };
      }
      
      // Clean up processed file
      await fs.unlink(processedPath).catch(() => {});
      
      return result;
      
    } catch (error) {
      console.error(`[Whisper] Transcription failed: ${error.message}`);
      
      return {
        success: false,
        text: `[Transcription failed: ${error.message}]`,
        language: 'unknown',
        error: error.message
      };
    }
  }

  async transcribeWithNapiRsWhisper(audioPath, options) {
    try {
      console.log(`[Whisper] Using @napi-rs/whisper...`);
      
      const whisper = require('@napi-rs/whisper');
      
      // Load the audio file
      const audioData = await fs.readFile(audioPath);
      
      // Try different model sizes
      const modelSizes = ['tiny', 'base'];
      
      for (const modelSize of modelSizes) {
        try {
          const modelPath = await this.getModelPath(modelSize);
          console.log(`[Whisper] Loading model: ${modelSize} from ${modelPath}`);
          
          // Create whisper instance
          const whisperInstance = new whisper.Whisper(modelPath);
          
          // Get audio info first
          console.log(`[Whisper] Decoding audio...`);
          const decodedAudio = await whisper.decodeAudio(audioData);
          
          // Create params
          const params = new whisper.WhisperFullParams();
          
          // Set language if provided
          if (options.language && options.language !== 'auto') {
            params.language = options.language;
          }
          
          // Set translation flag
          if (options.translate) {
            params.translate = true;
          }
          
          // Set strategy (greedy by default for speed)
          params.strategy = whisper.GREEDY;
          
          console.log(`[Whisper] Running inference...`);
          const startTime = Date.now();
          
          // Run inference
          const result = whisperInstance.full(decodedAudio, params);
          
          const duration = Date.now() - startTime;
          console.log(`[Whisper] Inference took ${duration}ms`);
          
          // Extract text from segments
          const segments = [];
          let fullText = '';
          
          const numSegments = result.getSegmentCount();
          console.log(`[Whisper] Got ${numSegments} segments`);
          
          for (let i = 0; i < numSegments; i++) {
            const segment = result.getSegmentData(i);
            segments.push({
              start: segment.start,
              end: segment.end,
              text: segment.text.trim()
            });
            fullText += segment.text + ' ';
          }
          
          const text = fullText.trim();
          const wordCount = text.split(/\s+/).length;
          
          console.log(`[Whisper] Transcription successful with ${modelSize}: ${wordCount} words`);
          
          return {
            success: true,
            text: text,
            language: params.language || 'unknown',
            wordCount: wordCount,
            segments: segments,
            duration: duration
          };
          
        } catch (modelError) {
          console.log(`[Whisper] Model ${modelSize} failed: ${modelError.message}`);
          continue;
        }
      }
      
      throw new Error('All models failed');
      
    } catch (error) {
      console.log(`[Whisper] @napi-rs/whisper error: ${error.message}`);
      throw error;
    }
  }

  async cleanupOldProcessedFiles(maxAgeHours = 1) {
    try {
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;
      
      const files = await fs.readdir(this.processedDir);
      
      for (const file of files) {
        const filePath = path.join(this.processedDir, file);
        const stats = await fs.stat(filePath);
        await fs.writeFile(transcriptPath, transcriptData.join('\n'));
        
        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          console.log(`[Whisper] Cleaned up processed file: ${file}`);
        }
      }
      
    } catch (error) {
      console.error(`[Whisper] Cleanup error: ${error.message}`);
    }
  }
}

module.exports = LocalWhisperTranscriber;