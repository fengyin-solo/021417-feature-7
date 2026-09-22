// 仅供 Node 测试使用：把源码里的 '@/' 别名解析到 src/
import { pathToFileURL } from 'node:url'
import { resolve as resolvePath } from 'node:path'

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = resolvePath(process.cwd(), 'src', specifier.slice(2))
    // 补上扩展名（测试与源码里省略 .js 的写法）
    try {
      return await nextResolve(pathToFileURL(base).href, context)
    } catch {
      return await nextResolve(pathToFileURL(base + '.js').href, context)
    }
  }
  return nextResolve(specifier, context)
}
