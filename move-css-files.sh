#!/bin/bash
# 移动所有 pages 目录下的 CSS 文件到对应的 css 子目录

cd apps/admin/src/pages

# docs
mv docs/doc-list.css docs/css/
mv docs/doc-editor.css docs/css/
mv docs/utility-pages.css docs/css/
mv docs/trash-header.css docs/css/
mv docs/trash-stats.css docs/css/
mv docs/trash-layout.css docs/css/
mv docs/trash-table.css docs/css/
mv docs/trash-responsive.css docs/css/

# login
mv login/login.css login/css/

# settings
mv settings/settings.css settings/css/
mv settings/security-center.css settings/css/
mv settings/settings-storage.css settings/css/

# forms
mv forms/form-list.css forms/css/
mv forms/form-editor.css forms/css/
mv forms/form-submissions.css forms/css/

# reviews
mv reviews/share-review.css reviews/css/

# invites
mv invites/invite.css invites/css/

# admin
mv admin/admin-layout.css admin/css/

# danger
mv danger/danger.css danger/css/

# register
mv register/register.css register/css/

echo "Done"