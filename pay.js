/* ==========================================================================
   CHEE-U / Studio DENIQ — 토스페이먼츠 v2 결제위젯 연동
   테스트 키(공식 문서용)로 동작하는 샘플입니다. 실결제 승인은 서버 confirm 필요.
   ========================================================================== */

const CLIENT_KEY = "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";
const AMOUNT = 350000;
const ORDER_NAME = "DENIQ AI 원데이클래스 수강료";
const CUSTOMER_KEY_STORAGE = "cheeu-toss-customer-key";

const form = document.querySelector("#pay-form");
const methodSlot = document.querySelector("#payment-method");
const agreementSlot = document.querySelector("#agreement");
const consentInput = document.querySelector("#pay-consent");
const payButton = document.querySelector("#pay-button");
const errorBox = document.querySelector("#pay-error");
const nameInput = document.querySelector("#buyer-name");
const phoneInput = document.querySelector("#buyer-phone");
const emailInput = document.querySelector("#buyer-email");

let widgets = null;
let widgetReady = false;

const won = (value) => `${Number(value).toLocaleString("ko-KR")}원`;

document.querySelectorAll("[data-pay-amount]").forEach((node) => {
  node.textContent = won(AMOUNT);
});

function showError(message) {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function customerKey() {
  try {
    const saved = window.localStorage.getItem(CUSTOMER_KEY_STORAGE);
    if (saved) return saved;
    const created = `cheeu_${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(CUSTOMER_KEY_STORAGE, created);
    return created;
  } catch {
    return `cheeu_${Math.random().toString(36).slice(2, 12)}`;
  }
}

function orderId() {
  const stamp = Date.now().toString(36);
  const tail = Math.random().toString(36).slice(2, 8);
  return `cheeu-oneday-${stamp}-${tail}`.slice(0, 64);
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function sessionLabel() {
  const checked = form?.querySelector('input[name="session"]:checked');
  return checked ? checked.closest("label")?.querySelector("strong")?.textContent?.trim() || "" : "";
}

/* ------------------------------------------------------------- form checks */
function validate() {
  const problems = [];
  const name = nameInput.value.trim();
  const phone = digits(phoneInput.value);

  const nameOk = name.length >= 2;
  nameInput.setAttribute("aria-invalid", String(!nameOk && name.length > 0));

  const phoneOk = /^01[016789]\d{7,8}$/.test(phone);
  phoneInput.setAttribute("aria-invalid", String(!phoneOk && phoneInput.value.length > 0));

  if (!sessionLabel()) problems.push("참여 회차를 선택해주세요.");
  if (!nameOk) problems.push("실명을 2자 이상 입력해주세요.");
  if (!phoneOk) problems.push("휴대폰 번호를 정확히 입력해주세요. (예: 010-9702-1213)");
  if (!consentInput.checked) problems.push("수강 신청 및 결제 동의에 체크해주세요.");
  if (!widgetReady) problems.push("결제 수단을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");

  return problems;
}

function refreshButton() {
  const problems = validate();
  payButton.disabled = problems.length > 0 || payButton.dataset.loading === "true";
  if (!problems.length) showError("");
  return problems;
}

[nameInput, phoneInput, emailInput].forEach((input) => {
  input?.addEventListener("input", () => {
    if (input === phoneInput) {
      const value = digits(input.value).slice(0, 11);
      if (value.length > 3 && value.length <= 7) input.value = `${value.slice(0, 3)}-${value.slice(3)}`;
      else if (value.length > 7) input.value = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
      else input.value = value;
    }
    refreshButton();
  });
  input?.addEventListener("blur", refreshButton);
});
consentInput?.addEventListener("change", refreshButton);
form?.querySelectorAll('input[name="session"]').forEach((radio) => {
  radio.addEventListener("change", refreshButton);
});

/* ------------------------------------------------------------ toss widgets */
async function initWidget() {
  if (!methodSlot) return;

  if (typeof window.TossPayments !== "function") {
    methodSlot.innerHTML = '<p class="toss-error">토스페이먼츠 결제위젯을 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 새로고침해주세요. 무통장 입금으로도 신청할 수 있습니다.</p>';
    return;
  }

  try {
    const tossPayments = window.TossPayments(CLIENT_KEY);
    widgets = tossPayments.widgets({ customerKey: customerKey() });

    await widgets.setAmount({ currency: "KRW", value: AMOUNT });

    methodSlot.innerHTML = "";
    await Promise.all([
      widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
      widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" })
    ]);

    widgetReady = true;
    refreshButton();
  } catch (error) {
    widgetReady = false;
    console.error("Toss widget init failed", error);
    const detail = error?.code ? ` (${error.code})` : "";
    methodSlot.innerHTML = `<p class="toss-error">결제 수단을 불러오지 못했습니다${detail}. 새로고침 후 다시 시도하시거나 무통장 입금으로 신청해주세요.</p>`;
  }
}

/* --------------------------------------------------------------- pay flow */
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const problems = validate();
  if (problems.length) {
    showError(problems[0]);
    refreshButton();
    return;
  }
  if (payButton.dataset.loading === "true") return;

  const name = nameInput.value.trim();
  const phone = digits(phoneInput.value);
  const email = emailInput.value.trim();

  payButton.dataset.loading = "true";
  payButton.disabled = true;
  payButton.textContent = "결제창을 여는 중입니다…";
  showError("");

  try {
    await widgets.requestPayment({
      orderId: orderId(),
      orderName: ORDER_NAME,
      successUrl: `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}success.html`,
      failUrl: `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}fail.html`,
      customerName: name,
      customerMobilePhone: phone,
      ...(email ? { customerEmail: email } : {}),
      metadata: { session: sessionLabel(), courseId: "deniq-ai-oneday", source: "cheeu-landing" }
    });
  } catch (error) {
    // 사용자가 결제창을 닫은 경우(PAY_PROCESS_CANCELED)는 조용히 되돌립니다.
    if (error?.code !== "PAY_PROCESS_CANCELED") {
      console.error("Toss requestPayment failed", error);
      showError(error?.message || "결제를 시작하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
    payButton.dataset.loading = "false";
    payButton.textContent = "결제하기";
    refreshButton();
  }
});

/* ---------------------------------------------------------------- dialogs */
document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-dialog]");
  if (!trigger) return;
  event.preventDefault();
  const dialog = document.getElementById(`dialog-${trigger.dataset.dialog}`);
  if (dialog && typeof dialog.showModal === "function") dialog.showModal();
});

document.querySelectorAll(".legal-dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

initWidget();
