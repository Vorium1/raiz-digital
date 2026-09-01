$ErrorActionPreference = "Stop"
$remote = "https://github.com/Vorium1/raiz-digital.git"
try {
  git remote get-url origin | Out-Null
  git remote set-url origin $remote
} catch {
  git remote add origin $remote
}
git branch -M main
git push -u origin main
