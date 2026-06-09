param(
    [string]$Message = "Update project"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
    throw "Эта папка не является git-репозиторием."
}

$branch = git branch --show-current
if (-not $branch) {
    throw "Не удалось определить текущую ветку."
}

git add -A

$changes = git status --short
if (-not $changes) {
    Write-Host "Нет изменений для сохранения."
    exit 0
}

git commit -m $Message

$upstream = git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null
if ($upstream) {
    $parts = $upstream -split "/", 2
    $remote = $parts[0]
    $remoteBranch = $parts[1]
    git push $remote "HEAD:$remoteBranch"
} else {
    git push -u origin $branch
}

Write-Host "Готово: изменения сохранены на GitHub из ветки $branch."
