# Servitor Discord Bot

BlightVeil's all-purpose Discord bot (`Servitor`), built on discord.js. Handles member management, nominations, kill/scorecard tracking, ELO ladders, voice channel automation, inventory/quartermaster commands, and more.

## Stack

- Node.js 18.x, discord.js v14
- MySQL (`mysql2`) for persistent data, MongoDB for auxiliary storage
- `pm2` for process management in production
- `@napi-rs/whisper` + `ffmpeg` for voice transcription features
- `puppeteer` / `canvas` for image and scorecard generation

## Project layout

```
server.js                 Entry point
commands/                 Slash command implementations
events/                   Discord.js event handlers (memberAdd, voiceStateUpdate, etc.)
handlers/                 Command/interaction routing
data/                     Static data (levels, message ID mappings)
utils/                    Shared helper functions
db.js                     Database connection setup (reads credentials from env)
commandPermissions.json   Role-based command permission config
fonts/, images/           Assets used for generated embeds/cards
```

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in real values — never commit `.env`:
   - `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` — bot auth
   - `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` — MySQL connection (see `db.js`)
   - `YOUTUBE_API_KEY`, `SC_API`, `SC_API2` — external API integrations
   - `SECRET_KEY`, `PREFIX`, `DEBUG_MODE`, `WHISPER_SERVER` — misc runtime config
3. Run the bot: `npm start`
4. Register/update slash commands: `npm run command-handler`

## Notes

- `Servitor WIP.md` tracks the current in-progress roadmap and planned refactors.
- Whisper voice models, crash logs, member data exports, and legacy backup archives are intentionally excluded from version control — see `.gitignore`.
