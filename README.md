# HYTKYbot
Microservice for a Telegram bot.

## Usage

- Use `cp .env.example .env` to create the file in which to place env variables
- Acquire Telegram bot token from @botfather
- Acquire Telegram group IDs and add them comma separated to the corresponding roles in the .env
- HTTP POST `localhost:3000` with JSON object with the key "user" with the Telegram user ID you want to check
- server will respond with JSON object containing "role" and a value of "admin", "user" or "none" (user not found in groups)
