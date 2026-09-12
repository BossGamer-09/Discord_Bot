const GUILD_ID = '1166103102378750033';

// Register slash commands function for specific guild
async function registerSlashCommands(client) {
  try {
    console.log('Registering slash commands for guild:', GUILD_ID);
    
    // Get the specific guild
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) {
      console.error(`Error: Guild ${GUILD_ID} not found or bot doesn't have access`);
      return false;
    }
    
    // First, fetch all existing guild commands
    const existingCommands = await guild.commands.fetch();
    console.log(`Found ${existingCommands.size} existing guild commands to remove`);
    
    // Log the existing commands for debugging
    if (existingCommands.size > 0) {
      console.log('Existing guild commands:');
      existingCommands.forEach(cmd => {
        console.log(`  - ${cmd.name} (ID: ${cmd.id})`);
      });
      
      // Remove all existing guild commands
      console.log('Removing all existing guild commands...');
      await guild.commands.set([]);
      console.log('All existing guild commands removed');
      
      // Small delay to ensure commands are cleared
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const commands = [
        {
            name: 'voice',
            description: 'Record voice conversations and transcribe to text',
            options: [
                {
                    type: 1, // SUB_COMMAND
                    name: 'join',
                    description: 'Join voice channel and start recording'
                },
                {
                    type: 1, // SUB_COMMAND
                    name: 'stop',
                    description: 'Stop recording and save transcript'
                },
                {
                    type: 1, // SUB_COMMAND
                    name: 'leave',
                    description: 'Leave voice channel without saving'
                },
                {
                    type: 1, // SUB_COMMAND
                    name: 'status',
                    description: 'Check recording status'
                }
            ]
        },
        {
            name: 'rank',
            description: 'Assigns roles and sets nickname based on a dynamic rank code',
            options: [
                {
                    type: 3, // STRING
                    name: 'rankcode',
                    description: 'Rank code (e.g., KS9, LM5, KME, KM?)',
                    required: true
                },
                {
                    type: 6, // USER
                    name: 'user',
                    description: 'User to assign rank to',
                    required: true
                }
            ],
            default_member_permissions: '8' // Administrator permission (8 = 1 << 3)
        },
        {
            name: 'bvrole',
            description: 'List all members who have a specific role',
            options: [
                {
                    type: 3, // STRING
                    name: 'role',
                    description: 'The role to list members for',
                    required: true,
                    autocomplete: true
                }
            ]
        }
    ];

    // Register new commands in the specific guild
    console.log('Registering new guild commands...');
    await guild.commands.set(commands);
    
    // Verify the commands were registered
    const newCommands = await guild.commands.fetch();
    console.log(`Successfully registered ${newCommands.size} commands in guild ${GUILD_ID}:`);
    newCommands.forEach(cmd => {
      console.log(`  - ${cmd.name} (ID: ${cmd.id})`);
    });
    
    console.log('Guild slash commands registration completed successfully');
    return true;
    
  } catch (error) {
    console.error('Error registering guild slash commands:', error);
    
    // More detailed error logging
    if (error.code) {
      console.error(`Error code: ${error.code}`);
    }
    if (error.message) {
      console.error(`Error message: ${error.message}`);
    }
    if (error.stack) {
      console.error(`Stack trace: ${error.stack}`);
    }
    
    return false;
  }
}

// Unregister slash commands function for specific guild
async function unregisterSlashCommands(client) {
  try {
    console.log('Unregistering slash commands from guild:', GUILD_ID);
    
    // Get the specific guild
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) {
      console.error(`Error: Guild ${GUILD_ID} not found or bot doesn't have access`);
      return false;
    }
    
    // Fetch existing guild commands
    const existingCommands = await guild.commands.fetch();
    console.log(`Found ${existingCommands.size} existing commands in guild ${GUILD_ID}:`);
    
    if (existingCommands.size > 0) {
      existingCommands.forEach(cmd => {
        console.log(`  - ${cmd.name} (ID: ${cmd.id})`);
      });
      
      // Delete all guild commands
      await guild.commands.set([]);
      console.log(`✅ Successfully removed ${existingCommands.size} commands from guild ${GUILD_ID}`);
    } else {
      console.log(`No commands found in guild ${GUILD_ID}`);
    }
    
    console.log('=== Guild Slash Command Unregistration Complete ===');
    return true;
    
  } catch (error) {
    console.error('❌ Error unregistering guild slash commands:', error);
    
    // More detailed error information
    if (error.code) {
      console.error(`Error code: ${error.code}`);
    }
    if (error.message) {
      console.error(`Error message: ${error.message}`);
    }
    if (error.stack) {
      console.error(`Stack trace: ${error.stack}`);
    }
    
    return false;
  }
}

// List current slash commands in the guild
async function listSlashCommands(client) {
  try {
    console.log('Listing slash commands in guild:', GUILD_ID);
    
    // Get the specific guild
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) {
      console.error(`Error: Guild ${GUILD_ID} not found`);
      return false;
    }
    
    const commands = await guild.commands.fetch();
    console.log(`Found ${commands.size} commands in guild ${GUILD_ID}:`);
    
    if (commands.size === 0) {
      console.log('No commands found');
      return true;
    }
    
    commands.forEach((cmd, index) => {
      console.log(`${index + 1}. ${cmd.name}`);
      console.log(`   ID: ${cmd.id}`);
      console.log(`   Description: ${cmd.description}`);
      
      if (cmd.options && cmd.options.length > 0) {
        console.log(`   Options: ${cmd.options.length}`);
        cmd.options.forEach((opt, optIndex) => {
          console.log(`     ${optIndex + 1}. ${opt.name} (${getOptionTypeName(opt.type)})`);
          console.log(`         Description: ${opt.description}`);
          console.log(`         Required: ${opt.required || false}`);
        });
      }
      
      console.log(`   Created: ${cmd.createdAt.toLocaleString()}`);
      console.log('---');
    });
    
    return true;
    
  } catch (error) {
    console.error('❌ Error listing guild slash commands:', error);
    return false;
  }
}

// Helper function to get option type names
function getOptionTypeName(type) {
  const typeMap = {
    1: 'SUB_COMMAND',
    2: 'SUB_COMMAND_GROUP',
    3: 'STRING',
    4: 'INTEGER',
    5: 'BOOLEAN',
    6: 'USER',
    7: 'CHANNEL',
    8: 'ROLE',
    9: 'MENTIONABLE',
    10: 'NUMBER',
    11: 'ATTACHMENT'
  };
  return typeMap[type] || `UNKNOWN (${type})`;
}

// Complete guild-specific command manager
class GuildCommandManager {
  constructor(client) {
    this.client = client;
    this.guildId = GUILD_ID;
  }
  
  // Unregister all commands from guild
  async unregisterAll() {
    return await unregisterSlashCommands(this.client);
  }
  
  // List all commands in guild
  async listCommands() {
    return await listSlashCommands(this.client);
  }
  
  // Register commands in guild (with automatic cleanup)
  async registerCommands(commands = null) {
    try {
      console.log('=== Starting Guild Command Registration ===');
      
      // First, unregister all existing guild commands
      await this.unregisterAll();
      
      // Add a small delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Use default commands if none provided
      const commandList = commands || this.getDefaultCommands();
      
      // Get the guild
      const guild = await this.client.guilds.fetch(this.guildId);
      if (!guild) {
        throw new Error(`Guild ${this.guildId} not found`);
      }
      
      // Register commands for specific guild
      await guild.commands.set(commandList);
      console.log(`✅ Registered ${commandList.length} commands for guild ${this.guildId}`);
      
      // List the newly registered commands
      await this.listCommands();
      
      console.log('=== Guild Command Registration Complete ===');
      return true;
      
    } catch (error) {
      console.error('❌ Error during guild command registration:', error);
      return false;
    }
  }
  
  // Get default commands
  getDefaultCommands() {
      return [
          {
              name: 'voice',
              description: 'Record voice conversations and transcribe to text',
              options: [
                  {
                      type: 1, // SUB_COMMAND
                      name: 'join',
                      description: 'Join voice channel and start recording'
                  },
                  {
                      type: 1, // SUB_COMMAND
                      name: 'stop',
                      description: 'Stop recording and save transcript'
                  },
                  {
                      type: 1, // SUB_COMMAND
                      name: 'leave',
                      description: 'Leave voice channel without saving'
                  },
                  {
                      type: 1, // SUB_COMMAND
                      name: 'status',
                      description: 'Check recording status'
                  }
              ]
          },
          {
              name: 'rank',
              description: 'Assigns roles and sets nickname based on a dynamic rank code',
              options: [
                  {
                      type: 3, // STRING
                      name: 'rank_code',
                      description: 'The rank code (e.g., LM8, UX9, KME, or LM? for evaluation)',
                      required: true,
                      autocomplete: true
                  },
                  {
                      type: 6, // USER
                      name: 'user',
                      description: 'The user to assign the rank to',
                      required: true
                  },
                  {
                      type: 3, // STRING
                      name: 'custom_code',
                      description: 'Custom rank code (if not in autocomplete)',
                      required: false
                  }
              ],
              default_member_permissions: '268435456' // Manage Roles permission (1 << 28)
          },
          {
              name: 'bvrole',
              description: 'List all members who have a specific role',
              options: [
                  {
                      type: 3, // STRING
                      name: 'role',
                      description: 'The role to list members for',
                      required: true,
                      autocomplete: true
                  }
              ]
          }
      ];
  }
}

// Export all functions
module.exports = {
  registerSlashCommands,
  unregisterSlashCommands,
  listSlashCommands,
  GuildCommandManager,
  GUILD_ID
};