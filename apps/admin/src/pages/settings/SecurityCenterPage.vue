<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import QRCode from "qrcode";
import { CheckCircle2, Copy, KeyRound, QrCode, RefreshCw, ShieldCheck, Smartphone } from "lucide-vue-next";
import {
  beginTotpSetupApi,
  disableTotpApi,
  enableTotpApi,
  getTotpStatusApi,
  regenerateRecoveryCodesApi,
  resetTotpApi,
  type TotpSetupView,
  type TotpStatusView
} from "../../api/security";
import { nativeConfirm } from "../../services/nativeDialog";
import "./css/security-center.css";

const status = ref<TotpStatusView | null>(null);
const setup = ref<TotpSetupView | null>(null);
const otp = ref("");
const recoveryCodes = ref<string[]>([]);
const loading = ref(false);
const message = ref("");
const qrCodeUrl = ref("");

const setupExpireText = computed(() => {
  if (!setup.value?.expireAt) return "";
  return new Date(setup.value.expireAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
});

async function copyText(value: string, label = "内容") {
  if (!value) return;
  await navigator.clipboard.writeText(value);
  message.value = `${label}已复制`;
}

watch(setup, async (value) => {
  qrCodeUrl.value = "";
  if (!value?.otpauthUrl) return;
  qrCodeUrl.value = await QRCode.toDataURL(value.otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 224,
    color: {
      dark: "#17213a",
      light: "#ffffff"
    }
  });
});

async function loadStatus() {
  loading.value = true;
  try {
    status.value = (await getTotpStatusApi()).status;
  } finally {
    loading.value = false;
  }
}

async function beginSetup() {
  loading.value = true;
  message.value = "";
  try {
    setup.value = (await beginTotpSetupApi()).setup;
    recoveryCodes.value = [];
  } finally {
    loading.value = false;
  }
}

async function enableTotp() {
  if (!otp.value.trim()) {
    message.value = "请输入 OTP";
    return;
  }
  loading.value = true;
  try {
    if (!setup.value?.setupToken) throw new Error("TOTP 设置已过期");
    const result = await enableTotpApi(otp.value.trim(), setup.value.setupToken);
    recoveryCodes.value = result.recoveryCodes;
    setup.value = null;
    otp.value = "";
    message.value = "TOTP 已开启";
    await loadStatus();
  } finally {
    loading.value = false;
  }
}

async function disableTotp() {
  const confirmed = await nativeConfirm({
    title: "关闭 TOTP",
    message: "关闭后危险操作不再要求验证器动态码，登录高风险时也不会触发 OTP。",
    confirmText: "关闭 TOTP",
    danger: true
  });
  if (!confirmed) return;
  loading.value = true;
  try {
    await disableTotpApi();
    setup.value = null;
    recoveryCodes.value = [];
    message.value = "TOTP 已关闭";
    await loadStatus();
  } finally {
    loading.value = false;
  }
}

async function regenerateRecoveryCodes() {
  const confirmed = await nativeConfirm({
    title: "生成新恢复码",
    message: "旧恢复码会立即失效，请保存新的恢复码。",
    confirmText: "生成新码"
  });
  if (!confirmed) return;
  loading.value = true;
  try {
    recoveryCodes.value = (await regenerateRecoveryCodesApi()).recoveryCodes;
    message.value = "恢复码已更新";
    await loadStatus();
  } finally {
    loading.value = false;
  }
}

async function resetTotp() {
  loading.value = true;
  try {
    setup.value = (await resetTotpApi()).setup;
    recoveryCodes.value = [];
    message.value = "请重新绑定认证器";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadStatus();
});
</script>

<template>
  <section class="security-center">
    <header class="security-center__head">
      <div>
        <small>安全中心</small>
        <h1>管理员双因素认证</h1>
      </div>
      <button class="cd-button" type="button" :disabled="loading" @click="loadStatus">
        <RefreshCw :size="16" />刷新
      </button>
    </header>

    <section class="security-center__card">
      <div class="security-center__status">
        <ShieldCheck :size="22" />
        <div>
          <strong>{{ status?.enabled ? "TOTP 已开启" : "TOTP 未开启" }}</strong>
          <span>{{ status?.enabled ? "危险操作必验；登录密码连续错误 5 次后才要求 OTP" : "支持 Google Authenticator / Microsoft Authenticator" }}</span>
        </div>
        <em>{{ status?.recoveryCodesRemaining ?? 0 }} 个恢复码可用</em>
      </div>

      <div class="security-center__actions">
        <button v-if="!status?.enabled" class="cd-button primary" type="button" :disabled="loading" @click="beginSetup">
          <KeyRound :size="16" />绑定验证器
        </button>
        <button v-if="status?.enabled" class="cd-button" type="button" :disabled="loading" @click="regenerateRecoveryCodes">生成恢复码</button>
        <button v-if="status?.enabled" class="cd-button" type="button" :disabled="loading" @click="resetTotp">重置 TOTP</button>
        <button v-if="status?.enabled" class="cd-button danger" type="button" :disabled="loading" @click="disableTotp">关闭 TOTP</button>
      </div>

      <div v-if="setup" class="security-center__setup">
        <div class="security-center__qr-panel">
          <div class="security-center__qr-title">
            <QrCode :size="18" />
            <strong>扫描二维码</strong>
          </div>
          <img v-if="qrCodeUrl" :src="qrCodeUrl" alt="TOTP 绑定二维码" />
          <div v-else class="security-center__qr-skeleton" aria-hidden="true" />
          <p>打开 Google Authenticator 或 Microsoft Authenticator 扫码。</p>
        </div>

        <div class="security-center__bind-panel">
          <div class="security-center__bind-head">
            <Smartphone :size="19" />
            <div>
              <strong>绑定验证器</strong>
              <span v-if="setupExpireText">密钥 {{ setupExpireText }} 前有效</span>
            </div>
          </div>

          <label class="cd-label security-center__secret">
            手动密钥
            <span>
              <input class="cd-input" readonly :value="setup.secret" />
              <button class="cd-button" type="button" @click="copyText(setup.secret, '密钥')">
                <Copy :size="15" />复制
              </button>
            </span>
          </label>

          <label class="cd-label">
            6 位验证码
            <input v-model.trim="otp" class="cd-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="输入验证器中的 6 位数字" />
          </label>

          <div class="security-center__setup-actions">
            <button class="cd-button primary" type="button" :disabled="loading" @click="enableTotp">
              <CheckCircle2 :size="16" />验证并开启
            </button>
            <button class="cd-button" type="button" @click="copyText(setup.otpauthUrl, 'OTP URI')">
              <Copy :size="15" />复制 URI
            </button>
          </div>
        </div>
      </div>

      <div v-if="recoveryCodes.length" class="security-center__codes">
        <div class="security-center__codes-head">
          <strong>恢复码（仅显示一次）</strong>
          <button class="cd-button" type="button" @click="copyText(recoveryCodes.join('\n'), '恢复码')">
            <Copy :size="15" />全部复制
          </button>
        </div>
        <code v-for="code in recoveryCodes" :key="code">{{ code }}</code>
      </div>

      <p v-if="message" class="security-center__message">{{ message }}</p>
    </section>
  </section>
</template>
