import { Bot } from 'grammy'
import Koa from 'koa'
import koaBody from 'koa-body'
import * as dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'
import logger from './logger'

interface UserRequestBody {
  user: string | number
}

interface AnnouncementRequestBody {
  message: string
}

dotenv.config()

const port = process.env.PORT || 3000

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 100

const rateLimitMiddleware = async (ctx: Koa.Context, next: () => Promise<void>) => {
  const ip = ctx.ip || ctx.request.ip
  const now = Date.now()
  
  const clientData = rateLimitMap.get(ip)
  
  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    await next()
  } else if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    logger.warn('Rate limit exceeded', { ip, count: clientData.count })
    ctx.status = 429
    ctx.body = JSON.stringify({ error: 'Too many requests, please try again later' })
  } else {
    clientData.count++
    await next()
  }
}

const isMemberInChat = async (userId: number, groupChatId: number, bot: Bot): Promise<boolean> => {
  logger.debug('Checking if user is in chat', { userId, groupChatId })
  try {
    const chatMember = await bot.api.getChatMember(groupChatId, userId);
    const isMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
    logger.debug('Chat membership check result', { userId, groupChatId, isMember, status: chatMember.status })
    return isMember;
  } catch (error) {
    logger.error('Error checking chat membership', { userId, groupChatId, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

const isMemberInAnyChat = async (userId: number, groupChatIds: number[], bot: Bot): Promise<boolean> => {
  const allPromiseResults:boolean[] = await Promise.all(groupChatIds.map( (groupChatId) => {
    return isMemberInChat(userId, groupChatId, bot)
  }))
  return allPromiseResults.some( (result) => result )
}

const isBotInAllGroups = async (groupChatIds: number[], bot: Bot): Promise<boolean> => {
  logger.info('Checking if bot is in all groups', { groupChatIds })
  try {
    const botId = await bot.api.getMe().then((botInfo) => botInfo.id);
    const allPromiseResults: boolean[] = await Promise.all(groupChatIds.map(async (groupChatId) => {
      try {
        await bot.api.getChatMember(groupChatId, botId);
        return true;
      } catch (error) {
        logger.warn('Bot not found in group', { groupChatId, error: error instanceof Error ? error.message : String(error) });
        return false;
      }
    }));
    const isInAllGroups = allPromiseResults.every((result) => result);
    logger.info('Bot group membership check completed', { isInAllGroups, groupChatIds });
    return isInAllGroups;
  } catch (error) {
    logger.error('Error checking bot group membership', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

// The main HYTKY app sends the Telegram user ID as a numeric string
// (see checkUserRole.ts), so numeric strings must be accepted here too.
const parseUserId = (userId: unknown): number | null => {
  if (typeof userId === 'number' && Number.isInteger(userId) && userId > 0) {
    return userId
  }
  if (typeof userId === 'string' && /^\d+$/.test(userId)) {
    const parsed = Number(userId)
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }
  return null
}

const isUserRequestBody = (body: unknown): body is UserRequestBody => {
  return typeof body === 'object' && body !== null && 'user' in body
}

const isAnnouncementRequestBody = (body: unknown): body is AnnouncementRequestBody => {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as AnnouncementRequestBody).message === 'string' &&
    (body as AnnouncementRequestBody).message.trim().length > 0
  )
}

const sendAnnouncement = async (message: string, groupChatIds: number[], bot: Bot) => {
  return Promise.all(groupChatIds.map(async (groupChatId) => {
    try {
      const result = await bot.api.sendMessage(groupChatId, message)
      logger.info('Announcement sent', { groupChatId, messageId: result.message_id })
      return { groupChatId, success: true, result }
    } catch (error) {
      logger.error('Error sending announcement', { groupChatId, error: error instanceof Error ? error.message : String(error) })
      return { groupChatId, success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }))
}

if (process.env.TG_BOT_TOKEN) {
  logger.info('Bot token configured successfully')
  const app = new Koa()
  
  app.use(rateLimitMiddleware)
  
  app.use(koaBody())

  if (!process.env.TG_ADMIN_GROUP_IDS) {
    logger.error('No admin group ID provided')
    process.exit(1)
  } else if (!process.env.TG_ACTIVE_GROUP_IDS) {
    logger.error('No active group ID provided')
    process.exit(1)
  } else if (!process.env.TG_ANNOUNCEMENT_GROUP_IDS) {
    logger.error('No announcement group ID provided')
    process.exit(1)
  }

  logger.info('Configuration loaded', {
    adminGroups: process.env.TG_ADMIN_GROUP_IDS,
    activeGroups: process.env.TG_ACTIVE_GROUP_IDS,
    announcementGroups: process.env.TG_ANNOUNCEMENT_GROUP_IDS
  })

  const adminGroups = process.env.TG_ADMIN_GROUP_IDS.split(',').map(id => parseInt(id))
  const activeGroups = process.env.TG_ACTIVE_GROUP_IDS.split(',').map(id => parseInt(id))
  const announcementGroups = process.env.TG_ANNOUNCEMENT_GROUP_IDS.split(',').map(id => parseInt(id))

  const bot = new Bot(process.env.TG_BOT_TOKEN)

  const allGroups = adminGroups.concat(activeGroups).concat(announcementGroups)
  isBotInAllGroups(allGroups, bot).then((result) => {
    if (!result) {
      logger.error('Bot is not in all required groups', { allGroups })
      process.exit(1)
    }
  }).catch((error) => {
    logger.error('Failed to verify bot group membership', { error: error instanceof Error ? error.message : String(error) })
    process.exit(1)
  })

  app.use(async (ctx, next) => {
    if (ctx.path === '/health') {
      ctx.body = { status: 'healthy', timestamp: new Date().toISOString() }
      ctx.status = 200
      return
    }
    await next()
  })

  app.use(async (ctx, next) => {
    if (ctx.path === '/announce' && ctx.method === 'POST') {
      const requestBody = ctx.request.body

      if (!isAnnouncementRequestBody(requestBody)) {
        logger.warn('Invalid announcement request body', { rawRequestBody: requestBody })
        ctx.body = JSON.stringify({ error: 'Invalid or missing message' })
        ctx.status = 400
        return
      }

      const results = await sendAnnouncement(requestBody.message, announcementGroups, bot)
      ctx.body = JSON.stringify({ results })
      ctx.status = 200
      return
    }
    await next()
  })

  app.use(async (ctx) => {
    const startTime = Date.now()
    const requestId = uuidv4()
    
    logger.info('Incoming request', {
      requestId,
      method: ctx.method,
      path: ctx.path,
      ip: ctx.ip,
      userAgent: ctx.get('User-Agent')
    })

    const requestBody = ctx.request.body

    logger.debug('Parsed request body', { requestId, requestBody })

    if (isUserRequestBody(requestBody)) {
      // Input validation
      const userId = parseUserId(requestBody.user)
      if (userId === null) {
        logger.warn('Invalid user ID provided', {
          requestId,
          userId: requestBody.user,
          userIdType: typeof requestBody.user,
          rawRequestBody: requestBody
        })
        ctx.body = JSON.stringify({ error: 'Invalid user ID' })
        ctx.status = 400
        return
      }

      try {
        let role: string
        if (await isMemberInAnyChat(userId, adminGroups, bot)) {
          role = 'admin'
        } else if (await isMemberInAnyChat(userId, activeGroups, bot)) {
          role = 'active'
        } else {
          role = 'nakki'
        }
        
        const responseTime = Date.now() - startTime
        logger.info('Request processed successfully', {
          requestId,
          userId,
          role,
          responseTime
        })
        
        ctx.body = JSON.stringify({ role })
      } catch (error) {
        const responseTime = Date.now() - startTime
        logger.error('Error processing request', {
          requestId,
          userId,
          error: error instanceof Error ? error.message : String(error),
          responseTime
        })
        ctx.body = JSON.stringify({ error: 'Internal server error' })
        ctx.status = 500
      }
    } else {
      logger.warn('Request missing user ID', { requestId, rawRequestBody: requestBody })
      ctx.body = JSON.stringify({ error: 'No user ID provided' })
      ctx.status = 400
    }
  })

  app.listen(port, () => {
    logger.info('Server started successfully', { port, environment: process.env.NODE_ENV || 'development' })
  })

} else {
  logger.error('No bot token provided in environment variables')
  process.exit(1)
}

