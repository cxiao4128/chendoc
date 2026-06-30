$ErrorActionPreference = 'Stop'
$base = "D:\desktop\bixu\js\chensdoc-claude\apps\admin\src\pages"

# docs
Move-Item "$base\docs\doc-list.css" "$base\docs\css\doc-list.css" -Force
Move-Item "$base\docs\doc-editor.css" "$base\docs\css\doc-editor.css" -Force
Move-Item "$base\docs\trash.css" "$base\docs\css\trash.css" -Force
Move-Item "$base\docs\trash-header.css" "$base\docs\css\trash-header.css" -Force
Move-Item "$base\docs\trash-stats.css" "$base\docs\css\trash-stats.css" -Force
Move-Item "$base\docs\trash-layout.css" "$base\docs\css\trash-layout.css" -Force
Move-Item "$base\docs\trash-table.css" "$base\docs\css\trash-table.css" -Force
Move-Item "$base\docs\trash-responsive.css" "$base\docs\css\trash-responsive.css" -Force
Move-Item "$base\docs\utility-pages.css" "$base\docs\css\utility-pages.css" -Force

# login
Move-Item "$base\login\login.css" "$base\login\css\login.css" -Force

# forms
Move-Item "$base\forms\form-list.css" "$base\forms\css\form-list.css" -Force
Move-Item "$base\forms\form-editor.css" "$base\forms\css\form-editor.css" -Force
Move-Item "$base\forms\form-submissions.css" "$base\forms\css\form-submissions.css" -Force

# reviews
Move-Item "$base\reviews\review.css" "$base\reviews\css\review.css" -Force

# invites
Move-Item "$base\invites\invite.css" "$base\invites\css\invite.css" -Force

# admin
Move-Item "$base\admin\admin-layout.css" "$base\admin\css\admin-layout.css" -Force

# danger
Move-Item "$base\danger\danger.css" "$base\danger\css\danger.css" -Force

# register
Move-Item "$base\register\register.css" "$base\register\css\register.css" -Force

Write-Host "All CSS files moved successfully!"