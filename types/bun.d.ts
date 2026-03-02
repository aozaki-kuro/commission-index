type BunSubprocess = {
  exited: Promise<number>
  killed: boolean
  kill: () => void
}

type BunSpawnOptions = {
  stdio?: ['inherit', 'inherit', 'inherit']
  env?: NodeJS.ProcessEnv
}

type BunServer = {
  port: number
}

type BunRuntime = {
  spawn: (cmd: string[], options?: BunSpawnOptions) => BunSubprocess
  serve: (options: {
    port: number
    fetch: (request: Request) => Response | Promise<Response>
  }) => BunServer
}

declare const Bun: BunRuntime
