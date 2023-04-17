# HYTKYbot
Microservice for a Telegram bot.

## Usage

- `docker build -t hytkybot`
- Use `cp .env.example .env` to create the file in which to place env variables (N.B.! Docker doesn't like quotes around env file values)
- Acquire Telegram bot token from @botfather
- Acquire Telegram group IDs (@username_to_id_bot can help) and add them comma separated to the corresponding roles in the .env
- `docker run -p 3000:3000 --env-file .env --name myHytkyBotContainer hytkybot`
- HTTP POST `localhost:3000` with JSON object with the key "user" with the Telegram user ID you want to check
- server will respond with JSON object containing "role" and a value of "admin", "active" or "nakki" (user not found in groups)

## New image uploading

- `git push origin/main 1.0.0`

New image will be tagged and pushed to the GitHub container registry when a tag contains a semantic versioning number.
