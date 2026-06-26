# Git Change Repo

## Steps

1. Check the current repo connection.

```powershell
git remote -v
```

2. Change the current local project to the new GitHub repo.

```powershell
git remote set-url origin https://github.com/ronams03/capstone1.5.git
```

3. Verify that the remote was changed correctly.

```powershell
git remote -v
```

4. Push your current local branch to the new repo.

```powershell
git push -u origin HEAD
```

5. If you want to push to a specific remote branch like `1.0`, use:

```powershell
git push origin HEAD:1.0
```

6. If `origin` does not exist yet:

```powershell
git remote add origin https://github.com/ronams03/capstone1.5.git
git remote -v
```

7. If you also want to rename the local folder:

```powershell
cd C:\xampp\htdocs
Rename-Item capstone1 capstone1.5
cd C:\xampp\htdocs\capstone1.5
```