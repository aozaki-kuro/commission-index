// 定义单个委托项目的接口
export interface Commission {
  fileName: string
  Links: string[]
  Design?: string // 修改为单个字符串
  Description?: string
  Keyword?: string
  Hidden?: boolean
}

// 定义每个角色的委托项目接口
export interface CharacterCommissions {
  Character: string
  Commissions: Commission[]
}

// 定义 Props 接口为 CharacterCommissions 的数组
export type Props = CharacterCommissions[]
