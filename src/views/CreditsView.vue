<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import EmptyState from '../components/EmptyState.vue';
import { getCreditLedger, getCreditPackages, getMyCredits, rechargeCredits } from '../api/modules';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';
import { relativeTime } from '../utils/format';
import type { CreditAccount, CreditPackage, LedgerEntry } from '../types/api';

const auth = useAuthStore();
const ui = useUiStore();
const account = ref<CreditAccount>({
  available: Number(auth.me?.credits.available) || 0,
  reserved: Number(auth.me?.credits.reserved) || 0,
});
const packages = ref<CreditPackage[]>([]);
const ledger = ref<LedgerEntry[]>([]);
const accountLoading = ref(false);
const packagesLoading = ref(false);
const ledgerLoading = ref(false);
const accountError = ref('');
const packagesError = ref('');
const ledgerError = ref('');
const rechargingId = ref('');
let ledgerRequest = 0;

const entryTypes: Record<string, string> = {
  reserve: '生成冻结',
  capture: '生成扣减',
  release: '生成退还',
  recharge: '充值到账',
  grant: '新人赠送',
  adjust: '积分调整',
};

const referenceTypes: Record<string, string> = {
  generation: '生成任务',
  order: '充值订单',
  adjustment: '积分调整',
};

function syncAccount(next: CreditAccount) {
  account.value = next;
  if (auth.me) auth.me.credits = { available: next.available, reserved: next.reserved };
}

function price(packageItem: CreditPackage) {
  return ((Number(packageItem.price_cents) || 0) / 100).toFixed(2);
}

function entryType(entry: LedgerEntry) {
  return entryTypes[entry.entry_type] || entry.entry_type || '积分变动';
}

function referenceType(entry: LedgerEntry) {
  return referenceTypes[entry.ref_type] || entry.ref_type || '积分账户';
}

function entryIcon(entry: LedgerEntry) {
  if (entry.entry_type === 'recharge' || entry.entry_type === 'grant') return 'star';
  if (entry.entry_type === 'release') return 'repeat';
  return 'music';
}

async function loadAccount() {
  if (accountLoading.value) return;
  accountLoading.value = true;
  accountError.value = '';
  try {
    syncAccount(await getMyCredits());
  } catch (reason) {
    accountError.value = ui.errorText(reason);
  } finally {
    accountLoading.value = false;
  }
}

async function loadPackages() {
  if (packagesLoading.value) return;
  packagesLoading.value = true;
  packagesError.value = '';
  try {
    const result = await getCreditPackages();
    packages.value = result.items || [];
  } catch (reason) {
    packagesError.value = ui.errorText(reason);
  } finally {
    packagesLoading.value = false;
  }
}

async function loadLedger() {
  const requestId = ++ledgerRequest;
  ledgerLoading.value = true;
  ledgerError.value = '';
  try {
    const result = await getCreditLedger({ limit: 30 });
    if (requestId === ledgerRequest) ledger.value = result.items || [];
  } catch (reason) {
    if (requestId === ledgerRequest) ledgerError.value = ui.errorText(reason);
  } finally {
    if (requestId === ledgerRequest) ledgerLoading.value = false;
  }
}

async function recharge(packageItem: CreditPackage) {
  if (rechargingId.value) return;
  rechargingId.value = packageItem.id;
  try {
    const next = await rechargeCredits({ package_id: packageItem.id });
    syncAccount(next);
    await loadLedger();
    ui.showToast(`充值成功，当前 ${next.available} 积分`);
  } catch (reason) {
    ui.showError(reason);
  } finally {
    rechargingId.value = '';
  }
}

onMounted(() => {
  void loadAccount();
  void loadPackages();
  void loadLedger();
});
</script>

<template>
  <div class="view credits-view">
    <header class="view-head">
      <div>
        <p class="eyebrow accent">CREATION CREDITS</p>
        <h2 class="h2">让每一份灵感，都有回响。</h2>
        <p class="view-desc">积分用于音乐生成。可用与冻结数量、充值套餐及账户流水均来自真实接口。</p>
      </div>
      <span class="view-head-side">最近 <b>{{ ledger.length }}</b> 条变动</span>
    </header>

    <div class="credit-layout">
      <section class="panel credit-card">
        <div class="panel-head"><h3><AppIcon name="star" />创作积分</h3><span class="mono">AVAILABLE</span></div>
        <EmptyState
          v-if="accountLoading || accountError"
          :loading="accountLoading"
          :error="accountError"
          :title="accountLoading ? '正在加载积分账户…' : '积分账户不可用'"
          @retry="loadAccount"
        />
        <template v-else>
          <div class="credit-big mono">{{ account.available }}</div>
          <p class="muted">当前可用于音乐生成的积分</p>
          <div class="credit-hint"><span>冻结中 {{ account.reserved }}</span><span>总计 {{ account.available + account.reserved }}</span></div>
          <div class="credit-actions">
            <span class="mono muted">冻结积分将在任务完成后扣减或退还</span>
            <button class="icon-btn tiny" type="button" title="刷新账户" aria-label="刷新账户" :disabled="accountLoading" @click="loadAccount"><AppIcon name="repeat" size="sm" /></button>
          </div>
        </template>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>充值创作积分</h3><span class="mono">REAL PACKAGES</span></div>
        <EmptyState
          v-if="packagesLoading || packagesError || !packages.length"
          :loading="packagesLoading"
          :error="packagesError"
          :title="packagesLoading ? '正在加载积分套餐…' : '暂无积分套餐'"
          description="套餐信息暂未发布，请稍后重试。"
          icon="star"
          @retry="loadPackages"
        />
        <div v-else class="package-grid">
          <button
            v-for="packageItem in packages"
            :key="packageItem.id"
            class="package package-card"
            type="button"
            :disabled="Boolean(rechargingId)"
            :aria-label="`充值 ${packageItem.credits} 积分，价格 ${price(packageItem)} 元`"
            @click="recharge(packageItem)"
          >
            <span v-if="packageItem.tag" class="pkg-tag">{{ packageItem.tag }}</span>
            <span class="package-credits">{{ rechargingId === packageItem.id ? '…' : packageItem.credits }}</span>
            <span>创作积分</span>
            <span class="package-price">¥{{ price(packageItem) }}</span>
            <span class="package-note">{{ rechargingId === packageItem.id ? '充值处理中' : '点击充值' }}</span>
          </button>
        </div>
      </section>
    </div>

    <section class="panel mt">
      <div class="panel-head">
        <h3><AppIcon name="clock" />积分流水</h3>
        <button class="icon-btn tiny" type="button" title="刷新流水" aria-label="刷新流水" :disabled="ledgerLoading" @click="loadLedger"><AppIcon name="repeat" size="sm" /></button>
      </div>
      <EmptyState
        v-if="ledgerLoading || ledgerError || !ledger.length"
        :loading="ledgerLoading"
        :error="ledgerError"
        :title="ledgerLoading ? '正在加载积分流水…' : '暂无积分流水'"
        description="生成或充值后的账户变动会显示在这里。"
        icon="clock"
        @retry="loadLedger"
      />
      <div v-else class="ledger-list">
        <div v-for="entry in ledger" :key="entry.id" class="ledger-row">
          <span class="ledger-icon"><AppIcon :name="entryIcon(entry)" size="sm" /></span>
          <div>
            <b>{{ entryType(entry) }}</b>
            <span>{{ referenceType(entry) }} · {{ relativeTime(entry.created_at) }} · 变动后余额 {{ entry.balance_after }}</span>
          </div>
          <span class="ledger-amount" :class="entry.amount > 0 ? 'plus' : 'minus'">{{ entry.amount > 0 ? '+' : '' }}{{ entry.amount }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
