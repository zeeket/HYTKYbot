import { Telegraf } from 'telegraf'
import Koa from 'koa'
import koaBody from 'koa-body'
import { message } from 'telegraf/filters'
import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config()

const port = process.env.PORT || 3000

if (process.env.TG_BOT_TOKEN) {
  const app = new Koa()

  app.use(koaBody())

  app.use((ctx) => {
    ctx.body = `Request Body: ${JSON.stringify(ctx.request.body)}`
  })
  /* const bot = new Telegraf(process.env.TG_BOT_TOKEN);

  bot.start((ctx) => ctx.reply("Welcome"));
  bot.help((ctx) => ctx.reply("Send me a sticker"));
  bot.on(message("sticker"), (ctx) => ctx.reply("👍"));
  bot.hears("hi", (ctx) => ctx.reply("Hey there"));
  bot.launch();

  app.use(async (ctx, next) =>
	(await bot.createWebhook({ domain: "hytky.kasv.io" }))(ctx.req, ctx.res, next),
  );

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM")); */

  app.listen(port, () => { console.log('Listening on port', port) })
} else {
  console.error('No token provided')
  process.exit(1)
}
