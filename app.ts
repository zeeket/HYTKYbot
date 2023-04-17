import { Telegraf } from 'telegraf'
import Koa from 'koa'
import koaBody from 'koa-body'
import { message } from 'telegraf/filters'
import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config()

const port = process.env.PORT || 3000

const isMemberInChat = async (userId: number, groupChatId: number, bot: Telegraf): Promise<boolean> => {
  console.log('Checking if user', userId, 'is in chat', groupChatId)
  try {
    const chatMember = await bot.telegram.getChatMember(groupChatId, userId);
    // Check if the user is a member of the chat and has not been kicked/banned
    return ['member', 'administrator', 'creator'].includes(chatMember.status);
  } catch (error) {
    // Handle errors, e.g. if the user is not in the chat or the bot does not have permission to access chat members
    console.error(error);
    return false;
  }
}

const isMemberInAnyChat = async (userId: number, groupChatIds: number[], bot: Telegraf): Promise<boolean> => {
  const allPromiseResults:boolean[] = await Promise.all(groupChatIds.map( (groupChatId) => {
    return isMemberInChat(userId, groupChatId, bot)
  }))
  return allPromiseResults.some( (result) => result )
}

const isBotInAllGroups = async (groupChatIds: number[], bot:Telegraf): Promise<boolean> => {
  console.log('Checking if bot is in all groups')
  const botId = await bot.telegram.getMe().then((botInfo) => botInfo.id);
  const allPromiseResults:boolean[] = await Promise.all(groupChatIds.map( (groupChatId) => {
    return (bot.telegram.getChatMember(groupChatId, botId) != null)
  }))
  return allPromiseResults.every( (result) => result )
}

if (process.env.TG_BOT_TOKEN) {
  console.log("My bot token is " + Array(process.env.TG_BOT_TOKEN.length).join("*"))
  const app = new Koa()
  app.use(koaBody())

  if (!process.env.TG_ADMIN_GROUP_IDS) {
    console.error('No admin group ID provided')
    process.exit(1)
 } else if (!process.env.TG_ACTIVE_GROUP_IDS) {
    console.error('No active group ID provided')
    process.exit(1)
  }
  console.log('Admin groups:', process.env.TG_ADMIN_GROUP_IDS)
  console.log('Active groups:', process.env.TG_ACTIVE_GROUP_IDS)

  const adminGroups = process.env.TG_ADMIN_GROUP_IDS.split(',').map(id => parseInt(id))
  const activeGroups = process.env.TG_ACTIVE_GROUP_IDS.split(',').map(id => parseInt(id))
  
  const bot = new Telegraf(process.env.TG_BOT_TOKEN)
  
  const allGroups = adminGroups.concat(activeGroups)
  isBotInAllGroups(allGroups, bot).then( (result) => {
    if (!result) {
      console.error('Bot is not in all groups')
      process.exit(1)
    }
  })

  app.use(async (ctx) => {
    if (ctx.request.body && ctx.request.body.user) {
      if (await isMemberInAnyChat(ctx.request.body.user, adminGroups, bot)) {
        ctx.body = JSON.stringify({role: 'admin'})
      } else if (await isMemberInAnyChat(ctx.request.body.user, activeGroups, bot)) {
        ctx.body = JSON.stringify({role: 'active'})
      } else {
        //TODO nakki groups(?) - currently everyone in the world is a nakki
      ctx.body = JSON.stringify({role: 'nakki'})
      }
    } else {
      ctx.body = 'No user ID provided'
      ctx.status = 400
    }
  })

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  app.listen(port, () => { console.log('Listening on port', port) })

} else {
  console.error('No token provided')
  process.exit(1)
}
