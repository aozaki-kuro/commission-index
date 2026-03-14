import process from 'node:process'

type LogLevel = 'info' | 'success' | 'warn' | 'error'

const RESET = '\u001B[0m'
const DIM = '\u001B[2m'
const BLUE = '\u001B[34m'
const YELLOW = '\u001B[33m'
const RED = '\u001B[31m'
const GREEN = '\u001B[32m'

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const supportsColor = () => Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined

function colorize(value: string, color: string) {
  return supportsColor() ? `${color}${value}${RESET}` : value
}

const formatTime = () => colorize(timeFormatter.format(new Date()), DIM)

const levelMessageColor: Record<LogLevel, string | null> = {
  info: null,
  success: GREEN,
  warn: YELLOW,
  error: RED,
}

export function createAstroStyleLogger(tag: string) {
  const tagLabel = colorize(`[${tag}]`, BLUE)

  const write = (level: LogLevel, message: string) => {
    const coloredMessage = levelMessageColor[level]
      ? colorize(message, levelMessageColor[level] as string)
      : message
    const line = `${formatTime()} ${tagLabel} ${coloredMessage}`
    if (level === 'error') {
      console.error(line)
      return
    }
    if (level === 'warn') {
      console.warn(line)
      return
    }
    process.stdout.write(`${line}\n`)
  }

  return {
    info: (message: string) => write('info', message),
    success: (message: string) => write('success', message),
    warn: (message: string) => write('warn', message),
    error: (message: string) => write('error', message),
  }
}
