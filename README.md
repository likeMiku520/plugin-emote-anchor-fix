# 评论表情面板定位修复

一个给 Halo 用的小插件，修复「评论组件 Next」的表情面板在部分主题下跑到页面顶部、而不是贴在表情按钮上方的问题。不需要修改主题，也不需要修改评论插件。

## 现象

- 在评论区回复某条评论时点开表情按钮，表情面板跑到页面顶部（或直接跑到视口外），没有出现在按钮上方；文章底部的评论框却正常。
- 窄屏下文章评论框的表情面板也会出现同样的偏移。
- 面板里的表情悬停预览也会出现在离面板很远的位置。

## 原因

评论组件 Next 的两种表情面板用的是两套定位：

- 文章评论框：面板是 `position: absolute`，挂在工具栏自己的定位上下文里，所以永远贴着按钮。
- 回复框（紧凑模式）与窄屏：面板切换成 `position: fixed`，由脚本用 `getBoundingClientRect()` 算出视口坐标，写进 `--comment-next-emote-fixed-top` / `--comment-next-emote-fixed-left`。

`position: fixed` 只有在包含块是视口时才与视口坐标一致。部分主题会给内容网格保留一个常驻的 `translate: 0` 作为横幅切换动画的插值基线（例如 Ethereal 的 `.enable-banner #main-grid { translate: 0 0 }`），而任何非 `none` 的 transform / translate / scale / filter 都会让该元素成为 fixed 后代的包含块。于是面板按「网格顶部」绘制，位置被整体抬高约一个滚动距离。

## 修复方式

插件向所有页面注入一段脚本，在表情面板打开后：

1. 找到面板真正的包含块，把 `--comment-next-emote-fixed-top` / `--comment-next-emote-fixed-left` 改写成相对该包含块的值，让面板回到按钮正上方；
2. 按钮上方空间不足时把面板翻到按钮下方（评论组件在回复模式下不会自行翻转）；
3. 一并修正面板内表情悬停预览的定位。

脚本不拦截网络请求、不读写数据库、不改写评论组件的 DOM 结构，只在面板存在时调整它的两个定位变量。

## 安装

1. 在 [Releases](https://github.com/likeMiku520/plugin-emote-anchor-fix/releases) 下载 JAR。
2. Halo 控制台 → 插件 → 安装，上传 JAR 后启用。
3. 无需任何配置。

运行环境：Halo 2.20 及以上。未安装或未启用评论组件 Next 时，脚本不会做任何事。

## 兼容性

- 只在 `position: fixed` 的面板上生效，文章评论框使用的 `absolute` 面板不受影响。
- 主题没有建立包含块时，计算结果与评论组件自带逻辑一致，不会产生位移。
- 适用于 Swup 一类无刷新换页的主题：换页后重新挂载的评论组件会被重新接管。
- 多次开关表情面板不会累积偏移。

## 构建

需要 JDK 21：

```bash
./gradlew build
```

产物位于 `build/libs/plugin-emote-anchor-fix-<version>.jar`。

## 许可

GPL-3.0