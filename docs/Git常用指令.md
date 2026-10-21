# Git 常用指令速查（宿舍小程序专用）

> 只收录这个项目实际会用到的。按场景查，别背。
> 记住一条：**拿不准的时候先 `git status`，它会告诉你现在能做什么。**

---

## 0. 一次性配置

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
git config --global init.defaultBranch main
```

查看当前配置：

```bash
git config --list
```

---

## 1. 拿到项目

```bash
git clone https://github.com/userna9/luguan-dorm.git
cd luguan-dorm
```

---

## 2. 每天开工的标准动作 ⭐

```bash
git checkout main        # 切到主分支
git pull                 # 拉最新代码
git checkout -b feature/打卡排行   # 开自己的分支
```

**这三行是"同时开发不打架"的核心**，养成肌肉记忆。

---

## 3. 提交

```bash
git status                  # 看哪些文件改了
git diff                    # 看具体改了哪几行
git add .                   # 全部加入暂存
git add miniprogram/pages/moments/moments.js   # 只加某个文件
git diff --staged           # 提交前最后检查（看暂存了什么）
git commit -m "feat: 打卡排行周榜"
git push -u origin feature/打卡排行
```

> 第一次推新分支用 `-u` 建立追踪，之后直接 `git push` 就行。

### 提交信息前缀

| 前缀 | 用途 | 例子 |
|---|---|---|
| `feat:` | 新功能 | `feat: 评论支持表情` |
| `fix:` | 修 bug | `fix: 昵称输入框被键盘顶出屏幕` |
| `style:` | 只改样式 | `style: 调整我的页头像区间距` |
| `docs:` | 只改文档 | `docs: 补充协作指南` |
| `refactor:` | 重构不改行为 | `refactor: 抽出头像映射工具` |

---

## 4. 分支

```bash
git branch                    # 本地分支列表
git branch -a                 # 含远程分支
git checkout -b feature/xxx   # 新建并切换
git checkout main             # 切回主分支
git branch -d feature/xxx     # 删除已合并的分支
git branch -D feature/xxx     # 强制删除（没合并的）
git merge feature/xxx         # 把 xxx 合并到当前分支
```

---

## 5. 查看历史

```bash
git log --oneline -10                 # 最近 10 条
git log --oneline --graph --all       # 图形化看分支结构
git show <commit>                     # 看某次提交改了什么
git blame miniprogram/pages/index/index.js   # 看每行是谁改的
```

---

## 6. 撤销（最容易搞错，仔细看表）

| 你想干什么 | 命令 | 影响范围 |
|---|---|---|
| 改了文件，还没 add，想丢弃 | `git restore <文件>` | 只丢这个文件 |
| 已经 add 了，想取消暂存 | `git restore --staged <文件>` | 改动还在，只是退出暂存 |
| 想改上一次提交的说明/补充文件 | `git commit --amend` | ⚠️ 只在**没 push** 前用 |
| 撤销最后一次提交，**改动保留** | `git reset --soft HEAD~1` | 回到暂存状态 |
| 撤销最后一次提交，**改动丢弃** | `git reset --hard HEAD~1` | ⚠️ 改动没了 |
| 已经 push 了想撤销 | `git revert <commit>` | 安全，生成一条反向提交 |
| 误删分支 / 误 reset 想找回 | `git reflog` | 见第 10 节 |

> `git restore` 是新写法，等价于老的 `git checkout -- <文件>`。两种都能用。

---

## 7. 冲突处理

```bash
git pull --rebase        # 拉代码，有冲突会停下来
```

打开冲突文件，会看到：

```
<<<<<<< HEAD
你的改动
=======
别人的改动
>>>>>>> feature/xxx
```

手动改成最终版本，**把 `<<<<<<<`、`=======`、`>>>>>>>` 这三行删掉**，然后：

```bash
git add 冲突的文件
git rebase --continue
```

想放弃这次 rebase：

```bash
git rebase --abort
```

---

## 8. 临时收起改动（改到一半要切分支）

```bash
git stash            # 把当前改动收起来
git stash list       # 看收了几份
git stash pop        # 恢复并删除这条记录
git stash apply      # 恢复但保留记录
git stash drop       # 删掉最新一条
```

---

## 9. 远程仓库

```bash
git remote -v                                   # 看远程地址
git remote add origin <url>                     # 添加远程
git remote set-url origin <url>                 # 改远程地址
git push -u origin main                         # 首次推送
git push                                        # 之后推送
git fetch --prune                               # 清理远程已删除的分支
```

---

## 10. 出事了先别慌

**第一步：什么都别删，别 reset。**

```bash
git status           # 现在在什么状态
git reflog           # 你最近所有操作（包括被 reset 掉的提交）
```

`git reflog` 输出像这样：

```
a26683d HEAD@{0}: reset: moving to HEAD~1
c0ed819 HEAD@{1}: commit: feat: 初始版本
```

找到你想回去的那个 commit，然后：

```bash
git reset --hard c0ed819
```

**只要没执行 `git gc`，误删的提交通常都能从 reflog 找回来。**

---

## 11. 危险操作清单 ⚠️

| 命令 | 后果 | 什么时候能用 |
|---|---|---|
| `git reset --hard` | **丢掉所有未提交改动** | 确认不要了 |
| `git push -f` | **覆盖远程历史，可能毁掉别人的工作** | 只在自己的 feature 分支上用 |
| `git clean -fd` | 删除所有未跟踪文件（**包括你新建还没 add 的文件**） | 极少用，先 `git clean -n` 预览 |
| `git checkout -- .` | 丢弃所有改动 | 几乎不要用 |
| `git branch -D` | 强制删未合并分支 | 确认分支内容不要了 |

> 拿不准就先 `git stash` 或 `git branch backup`，给自己留后路。

---

## 12. 本项目高频场景对照

| 我想…… | 怎么做 |
|---|---|
| 开始做新功能 | `git checkout main && git pull && git checkout -b feature/xxx` |
| 看看自己改了啥 | `git status` + `git diff` |
| 提交并推到 GitHub | `git add -A && git commit -m "feat: xxx" && git push` |
| 拉室友的新代码 | `git checkout main && git pull` |
| 我的分支落后了 | `git checkout feature/xxx && git rebase main` |
| 改错了一个文件想还原 | `git restore <文件>` |
| 提交信息写错了（还没推） | `git commit --amend -m "新信息"` |
| 推上去发现有问题 | 再提一个 `fix:` 提交（**别 reset 后强推**） |
| 想确认线上跑的是哪版代码 | `git log --oneline -3` 对照云函数返回的 `version` |

---

## 13. 一句话原则

> **开工先 pull，改前开分支，提交写清楚，推完开 PR。**
> **不确定就 `git status`，闯祸就 `git reflog`。**
