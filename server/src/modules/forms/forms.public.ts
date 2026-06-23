import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getFormByUid, incrementFormView, submitForm, type FormField } from "./forms.service.js";
import { getSiteConfig } from "../settings/settings.service.js";
import { sharePageStyle } from "../public/sharePageStyle.js";

const bundledLogoUrl = "/site-assets/chendoc-logo-192.webp";

// ===== 站点配置缓存 =====
interface CachedSiteBrand {
  siteName: string;
  logoUrl: string;
  cachedAt: number;
}

const SITE_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedSiteBrand: CachedSiteBrand | null = null;

async function getCachedSiteBrand(): Promise<CachedSiteBrand> {
  const nowMs = Date.now();
  if (cachedSiteBrand && (nowMs - cachedSiteBrand.cachedAt) < SITE_CONFIG_CACHE_TTL_MS) {
    return cachedSiteBrand;
  }
  const config = await getSiteConfig();
  cachedSiteBrand = {
    siteName: config.shortName?.trim() || config.brandName?.trim() || "陈书",
    logoUrl: config.preferRemoteLogo && config.logoUrl ? config.logoUrl : bundledLogoUrl,
    cachedAt: nowMs
  };
  return cachedSiteBrand;
}

// ===== HTML 转义 =====
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function serializeInlineJson(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

// ===== 渲染字段 =====
function renderField(field: FormField) {
  const fieldName = escapeHtml(field.id);
  const id = `field_${fieldName}`;
  const required = field.required ? ' required' : '';
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
  const maxLength = field.maxLength ? ` maxlength="${field.maxLength}"` : '';

  switch (field.type) {
    case "text":
    case "name":
    case "address":
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <input type="text" id="${id}" name="${fieldName}"${required}${placeholder}${maxLength} class="form-input">
        </div>`;

    case "textarea":
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <textarea id="${id}" name="${fieldName}"${required}${placeholder}${maxLength} class="form-textarea" rows="4"></textarea>
        </div>`;

    case "number":
    case "age":
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <input type="number" id="${id}" name="${fieldName}"${required}${placeholder}${field.min !== undefined ? ` min="${field.min}"` : ""}${field.max !== undefined ? ` max="${field.max}"` : ""} class="form-input">
        </div>`;

    case "select":
    case "radio":
      const selectOptions = (field.options || []).map(opt =>
        `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`
      ).join('');
      const inputType = field.type === "radio" ? "radio" : "select";
      if (inputType === "radio") {
        const radioOptions = (field.options || []).map(opt =>
          `<label class="radio-label"><input type="radio" name="${fieldName}" value="${escapeHtml(opt)}"${required}> ${escapeHtml(opt)}</label>`
        ).join('');
        return `
        <div class="form-field" data-field-id="${fieldName}">
          <label>${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <div class="radio-group">${radioOptions}</div>
        </div>`;
      }
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <select id="${id}" name="${fieldName}"${required} class="form-select">
            <option value="">请选择</option>
            ${selectOptions}
          </select>
        </div>`;

    case "multiselect":
      const checkboxOptions = (field.options || []).map((opt, i) =>
        `<label class="checkbox-label"><input type="checkbox" name="${fieldName}" value="${escapeHtml(opt)}"> ${escapeHtml(opt)}</label>`
      ).join('');
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label>${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <div class="checkbox-group">${checkboxOptions}</div>
        </div>`;

    case "date":
    case "datetime":
    case "time":
      const dateInputType = field.type === "datetime" ? "datetime-local" : field.type;
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <input type="${dateInputType}" id="${id}" name="${fieldName}"${required} class="form-input">
        </div>`;

    case "checkbox":
      return `
        <div class="form-field form-field-checkbox" data-field-id="${fieldName}">
          <label class="checkbox-single">
            <input type="checkbox" id="${id}" name="${fieldName}" value="true"${required}>
            ${escapeHtml(field.label)}
          </label>
        </div>`;

    case "phone":
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <input type="tel" id="${id}" name="${fieldName}"${required}${placeholder}${maxLength} pattern="1[3-9]\\d{9}" class="form-input">
        </div>`;

    case "email":
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <input type="email" id="${id}" name="${fieldName}"${required}${placeholder}${maxLength} class="form-input">
        </div>`;

    case "idcard":
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <input type="text" id="${id}" name="${fieldName}"${required}${placeholder}${maxLength} pattern="(?:\\d{15}|\\d{17}[\\dXx])" class="form-input">
        </div>`;

    case "gender":
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label>${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <div class="radio-group">
            ${["男", "女", "其他"].map((option) => `<label class="radio-label"><input type="radio" name="${fieldName}" value="${option}"${required}> ${option}</label>`).join("")}
          </div>
        </div>`;

    case "rating":
      const ratingStars = [1, 2, 3, 4, 5].map(n =>
        `<label class="star-label"><input type="radio" name="${fieldName}" value="${n}"${required}> <span class="star">★</span></label>`
      ).join('');
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label>${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <div class="rating-group">${ratingStars}</div>
        </div>`;

    case "city":
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <div class="city-select">
            <select name="${fieldName}_province" class="form-select city-province" data-parent="${fieldName}"${required}>
              <option value="">请选择省份</option>
            </select>
            <select name="${fieldName}_city" class="form-select city-city" data-parent="${fieldName}" disabled>
              <option value="">请选择城市</option>
            </select>
          </div>
        </div>`;

    case "image":
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <input type="url" id="${id}" name="${fieldName}"${required}${placeholder || ' placeholder="请输入图片链接"'} class="form-input">
        </div>`;

    case "section":
      return `
        <section class="form-section" aria-labelledby="${id}">
          <h2 id="${id}">${escapeHtml(field.label)}</h2>
          ${field.placeholder ? `<p>${escapeHtml(field.placeholder)}</p>` : ""}
        </section>`;

    default:
      return `
        <div class="form-field" data-field-id="${fieldName}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? '<span class="required">*</span>' : ''}</label>
          <input type="text" id="${id}" name="${fieldName}"${required}${placeholder}${maxLength} class="form-input">
        </div>`;
  }
}

// ===== 表单样式 =====
const formPageStyle = `
  .form-container { max-width: 640px; margin: 0 auto; padding: 24px 16px; }
  .form-field { margin-bottom: 24px; }
  .form-field label { display: block; margin-bottom: 8px; font-weight: 600; color: var(--ink); }
  .form-field .required { color: var(--danger); margin-left: 4px; }
  .form-input, .form-textarea, .form-select {
    width: 100%; padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px;
    font-size: 15px; background: var(--paper); transition: border-color 0.15s, box-shadow 0.15s;
  }
  .form-input:focus, .form-textarea:focus, .form-select:focus {
    outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }
  .form-textarea { resize: vertical; min-height: 100px; }
  .checkbox-group { display: flex; flex-direction: column; gap: 10px; }
  .checkbox-label, .checkbox-single { display: flex; align-items: center; gap: 8px; min-height: 44px; cursor: pointer; font-weight: normal; }
  .checkbox-label input, .checkbox-single input { width: 18px; height: 18px; accent-color: var(--accent); }
  .radio-group { display: flex; flex-direction: column; gap: 10px; }
  .radio-label { display: flex; align-items: center; gap: 8px; min-height: 44px; cursor: pointer; font-weight: normal; }
  .radio-label input { width: 18px; height: 18px; accent-color: var(--accent); }
  .rating-group { display: flex; gap: 4px; }
  .star-label { display: grid; min-width: 44px; min-height: 44px; place-items: center; cursor: pointer; }
  .star-label { position: relative; }
  .star-label input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .star-label .star { font-size: 28px; color: var(--border-strong); transition: color 0.15s; }
  .star-label input:checked ~ .star, .star-label:hover .star { color: #f59e0b; }
  .city-select { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-section { margin: 30px 0 18px; border-bottom: 1px solid var(--border); padding-bottom: 10px; }
  .form-section h2 { margin: 0; color: var(--ink); font-size: 18px; }
  .form-section p { margin: 6px 0 0; color: var(--ink-light); font-size: 14px; line-height: 1.6; }
  .form-submit {
    width: 100%; padding: 14px; background: var(--accent); color: white; border: none;
    border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer; transition: background 0.15s;
  }
  .form-submit:hover { background: var(--accent-dark); }
  .form-submit:disabled { opacity: 0.7; cursor: not-allowed; }
  .form-success { text-align: center; padding: 32px 24px; }
  .form-success .success-icon { font-size: 64px; margin-bottom: 16px; }
  .form-success h2 { color: #10b981; font-size: 24px; margin-bottom: 8px; }
  .form-success .success-desc { color: var(--ink-light); margin-bottom: 24px; }
  .success-data { text-align: left; background: #f9fafb; border-radius: 12px; padding: 20px; margin-top: 24px; }
  .success-data h3 { font-size: 14px; color: var(--ink-light); margin-bottom: 16px; }
  .data-item { display: flex; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .data-item:last-child { border-bottom: none; }
  .data-item .data-label { width: 100px; color: var(--ink-light); font-size: 14px; flex-shrink: 0; }
  .data-item .data-value { color: var(--ink); font-size: 15px; word-break: break-all; }
  .form-error { background: rgba(220, 38, 38, 0.1); border: 1px solid var(--danger); border-radius: 8px; padding: 12px 16px; color: var(--danger); margin-bottom: 16px; }
  .form-privacy { margin: 8px 0 18px; border-top: 1px solid var(--border); padding-top: 14px; color: var(--ink-light); font-size: 13px; line-height: 1.65; }
  .share-card { background: var(--paper); border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .exclusive-info-display { background: #eff6ff; border-radius: 12px; padding: 20px; margin-top: 24px; border: 1px solid #bfdbfe; }
  .exclusive-info-display h3 { font-size: 14px; color: var(--ink-light); margin-bottom: 16px; }
  .form-input:focus-visible, .form-textarea:focus-visible, .form-select:focus-visible,
  .checkbox-label input:focus-visible, .checkbox-single input:focus-visible, .radio-label input:focus-visible,
  .star-label input:focus-visible + .star, .form-submit:focus-visible {
    outline: 3px solid rgba(37, 99, 235, 0.24); outline-offset: 2px;
  }
  @media (max-width: 480px) {
    .city-select { grid-template-columns: 1fr; }
    .data-item { flex-direction: column; }
    .data-item .data-label { margin-bottom: 4px; }
  }
`;

// ===== 渲染页面 =====
export async function renderFormPage(formUid: string) {
  const [brand, form, siteConfig] = await Promise.all([
    getCachedSiteBrand(),
    getFormByUid(formUid).catch(() => null),
    getSiteConfig()
  ]);

  if (!form || form.status !== "published") {
    const unavailable = renderFormUnavailablePage({
      title: "表单不可用",
      message: form ? "此表单已关闭" : "表单不存在",
      siteName: brand.siteName,
      logoUrl: brand.logoUrl
    });
    return {
      ...unavailable,
      statusCode: form ? 403 : 404,
      nonce: null
    };
  }

  // 记录访问
  void incrementFormView(formUid).catch(() => undefined);

  const nonce = randomBytes(12).toString("base64url");
  const fieldsHtml = form.fields.map((field) => renderField(field)).join("");

  // 专属信息：如果表单有自己的 exclusiveInfo 就用它，否则用全局的 shareFooterText
  const globalShareFooterText = siteConfig.shareFooterText?.trim() || "";
  const formExclusiveInfo = form.exclusiveInfo;
  // 将表单专属信息转为 JSON 字符串传给前端
  const exclusiveInfoJson = serializeInlineJson(formExclusiveInfo ? Object.entries(formExclusiveInfo) : null);
  const fieldLabelsJson = serializeInlineJson(Object.fromEntries(
    form.fields.filter((field) => field.type !== "section").map((field) => [field.id, field.label])
  ));

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(form.title)} - ${escapeHtml(brand.siteName)}</title>
  <meta name="description" content="${escapeHtml(form.description || form.title)}">
  <link rel="preload" as="image" href="${escapeHtml(brand.logoUrl)}">
  <style>${sharePageStyle}</style>
  <style>${formPageStyle}</style>
</head>
<body>
  <div class="topbar">
    <a class="brand" href="/" rel="noopener noreferrer">
      <img src="${escapeHtml(brand.logoUrl)}" alt="">
      <span class="brand__name">${escapeHtml(brand.siteName)}</span>
    </a>
  </div>
  <main>
    <div class="form-container">
      <header>
        <p class="share-kicker">收集表</p>
        <h1>${escapeHtml(form.title)}</h1>
        ${form.description ? `<p class="lead">${escapeHtml(form.description)}</p>` : ""}
      </header>
      <div id="form-content">
        <form id="form" data-form-uid="${escapeHtml(formUid)}">
          <div class="share-card">
            ${fieldsHtml}
            ${(form.privacyNotice || form.retentionDays) ? `<p class="form-privacy">${escapeHtml(form.privacyNotice || "提交内容仅用于本表单所述用途。")} ${form.retentionDays ? `数据保留 ${form.retentionDays} 天，期满后自动清理。` : ""}</p>` : ""}
            <button type="submit" class="form-submit" data-submit-btn>提交</button>
          </div>
        </form>
      </div>
      <div id="form-success" class="share-card form-success" style="display:none;">
        <div class="success-icon">✅</div>
        <h2>提交成功</h2>
        <p class="success-desc">感谢您的填写，数据已收到</p>
        <div id="exclusive-info-display" class="exclusive-info-display" style="display:none;">
          <h3>您的专属信息</h3>
          <div id="exclusive-info-list"></div>
        </div>
        <div id="submitted-data" class="success-data" style="display:none;">
          <h3>您的填写</h3>
          <div id="data-list"></div>
        </div>
      </div>
    </div>
  </main>
  <script nonce="${nonce}">
    (function() {
      // HTML 转义函数
      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }
      // 专属信息：优先使用表单专属信息，否则使用全局的
      var formExclusiveInfo = ${exclusiveInfoJson};
      var globalShareFooterText = ${serializeInlineJson(globalShareFooterText)};
      var fieldLabels = ${fieldLabelsJson};

      var form = document.getElementById('form');
      var formContent = document.getElementById('form-content');
      var formSuccess = document.getElementById('form-success');
      var submitBtn = document.querySelector('[data-submit-btn]');
      var exclusiveInfoDisplay = document.getElementById('exclusive-info-display');
      var exclusiveInfoList = document.getElementById('exclusive-info-list');
      var captchaId = '';

      function appendDataItem(parent, label, value) {
        var item = document.createElement('div');
        item.className = 'data-item';
        var labelNode = document.createElement('span');
        labelNode.className = 'data-label';
        labelNode.textContent = String(label);
        var valueNode = document.createElement('span');
        valueNode.className = 'data-value';
        valueNode.textContent = String(value);
        item.appendChild(labelNode);
        item.appendChild(valueNode);
        parent.appendChild(item);
      }

      async function showCaptcha() {
        var container = document.getElementById('form-captcha');
        var result = await fetch('/api/captcha').then(function(response) { return response.json(); });
        captchaId = result.captchaId;
        if (!container) {
          container = document.createElement('div');
          container.id = 'form-captcha';
          container.className = 'form-field';
          var label = document.createElement('label');
          label.textContent = '安全验证';
          var image = document.createElement('img');
          image.id = 'form-captcha-image';
          image.alt = '验证码';
          image.width = 150;
          image.height = 48;
          var input = document.createElement('input');
          input.id = 'form-captcha-code';
          input.className = 'form-input';
          input.placeholder = '请输入计算结果';
          input.autocomplete = 'off';
          container.appendChild(label);
          container.appendChild(image);
          container.appendChild(input);
          submitBtn.parentNode.insertBefore(container, submitBtn);
        }
        document.getElementById('form-captcha-image').src = result.image;
        document.getElementById('form-captcha-code').focus();
      }

      form?.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '提交中...'; }

        const formData = new FormData(form);
        const data = {};
        formData.forEach(function(value, key) {
          if (key.endsWith('_province') || key.endsWith('_city')) return;
          if (data[key] !== undefined) {
            if (Array.isArray(data[key])) data[key].push(value);
            else data[key] = [data[key], value];
          } else {
            data[key] = value;
          }
        });

        // 合并城市选择
        const cityFields = {};
        formData.forEach(function(value, key) {
          if (key.endsWith('_province')) {
            const fieldId = key.replace('_province', '');
            cityFields[fieldId] = cityFields[fieldId] || {};
            cityFields[fieldId].province = value;
          } else if (key.endsWith('_city')) {
            const fieldId = key.replace('_city', '');
            cityFields[fieldId] = cityFields[fieldId] || {};
            cityFields[fieldId].city = value;
          }
        });
        Object.assign(data, Object.fromEntries(
          Object.entries(cityFields).map(function([k, v]) {
            return [k, v.province && v.city ? v.province + ' ' + v.city : v.province || ''];
          })
        ));

        try {
          const res = await fetch('/f/' + form.dataset.formUid + '/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              data: data,
              captchaId: captchaId || undefined,
              captchaCode: document.getElementById('form-captcha-code')?.value || undefined
            })
          });
          const json = await res.json();
          if (json.code === 'FORM_NEED_CAPTCHA' || json.code === 'FORM_CAPTCHA_FAILED') {
            await showCaptcha();
          }
          if (json.code !== 0 && json.code !== '0') {
            throw new Error(json.message || '提交失败');
          }
          // 显示专属信息（优先表单专属信息，否则用全局的）
          if (exclusiveInfoDisplay && exclusiveInfoList) {
            exclusiveInfoList.innerHTML = '';
            var hasExclusiveInfo = false;
            // 如果表单有专属信息，显示它
            if (formExclusiveInfo) {
              formExclusiveInfo.forEach(function(item) {
                var key = item[0];
                var value = item[1];
                if (value && value.trim()) {
                  hasExclusiveInfo = true;
                  appendDataItem(exclusiveInfoList, key, value);
                }
              });
            }
            // 如果没有表单专属信息但有全局专属信息，显示全局的
            if (!hasExclusiveInfo && globalShareFooterText) {
              hasExclusiveInfo = true;
              appendDataItem(exclusiveInfoList, '专属信息', globalShareFooterText);
            }
            if (hasExclusiveInfo) {
              exclusiveInfoDisplay.style.display = 'block';
            }
          }
          // 显示提交的数据
          var dataList = document.getElementById('data-list');
          var submittedData = document.getElementById('submitted-data');
          if (dataList && submittedData) {
            dataList.innerHTML = '';
            Object.keys(data).forEach(function(key) {
              var value = data[key];
              if (Array.isArray(value)) value = value.join('、');
              if (value !== undefined && value !== null && value !== '') {
                appendDataItem(dataList, fieldLabels[key] || '已填写', value === true ? '是' : value);
              }
            });
            submittedData.style.display = 'block';
          }
          formContent.style.display = 'none';
          formSuccess.style.display = 'block';
        } catch(err) {
          var errorMsg = err.message || '提交失败，请稍后重试';
          var errorDiv = document.createElement('div');
          errorDiv.className = 'form-error';
          errorDiv.textContent = errorMsg;
          formContent.insertBefore(errorDiv, form);
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '提交'; }
          setTimeout(function() { if (errorDiv.parentNode) errorDiv.parentNode.removeChild(errorDiv); }, 5000);
        }
      });

      // 城市选择数据（简化版）
      var provinces = ['北京市','天津市','上海市','重庆市','河北省','山西省','辽宁省','吉林省','黑龙江省','江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','海南省','四川省','贵州省','云南省','陕西省','甘肃省','青海省','内蒙古自治区','广西壮族自治区','西藏自治区','宁夏回族自治区','新疆维吾尔自治区'];
      var cities = {
        '北京市': ['东城区','西城区','朝阳区','丰台区','石景山区','海淀区','门头沟区','房山区','通州区','顺义区','昌平区','大兴区','怀柔区','平谷区','密云区','延庆区'],
        '上海市': ['黄浦区','徐汇区','长宁区','静安区','普陀区','虹口区','杨浦区','闵行区','宝山区','嘉定区','浦东新区','金山区','松江区','青浦区','奉贤区','崇明区'],
        '广东省': ['广州市','深圳市','珠海市','汕头市','佛山市','韶关市','湛江市','肇庆市','江门市','茂名市','惠州市','梅州市','汕尾市','河源市','阳江市','清远市','东莞市','中山市','潮州市','揭阳市','云浮市']
      };

      document.querySelectorAll('.city-province').forEach(function(sel) {
        provinces.forEach(function(p) {
          var opt = document.createElement('option');
          opt.value = p; opt.textContent = p;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', function() {
          var fieldId = sel.dataset.parent;
          var citySel = document.querySelector('.city-city[data-parent="' + fieldId + '"]');
          if (!citySel) return;
          citySel.innerHTML = '<option value="">请选择城市</option>';
          citySel.disabled = !this.value;
          var cityList = cities[this.value];
          if (cityList) {
            cityList.forEach(function(c) {
              var opt = document.createElement('option');
              opt.value = c; opt.textContent = c;
              citySel.appendChild(opt);
            });
          }
        });
      });
    })();
  </script>
</body>
</html>`;

  return { statusCode: 200, html, nonce };
}

export function renderFormUnavailablePage(input: { title: string; message: string; siteName: string; logoUrl: string }) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)} - ${escapeHtml(input.siteName)}</title>
  <style>${sharePageStyle}</style>
</head>
<body>
  <div class="topbar">
    <a class="brand" href="/" rel="noopener noreferrer">
      <img src="${escapeHtml(input.logoUrl)}" alt="">
      <span class="brand__name">${escapeHtml(input.siteName)}</span>
    </a>
  </div>
  <main>
    <header>
      <p class="share-kicker">收集表</p>
      <h1>${escapeHtml(input.title)}</h1>
    </header>
    <section class="share-card">
      <p class="share-status is-error">${escapeHtml(input.message)}</p>
    </section>
  </main>
</body>
</html>`;

  return { statusCode: 404, html };
}
