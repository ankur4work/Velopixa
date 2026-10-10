import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getBillingState,
  managedPricingUrl,
  appBridgeRedirect,
  cancelSubscription,
} from "../billing.server";
import { getUsage } from "../usage.server";
import {
  Page,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Divider,
  Banner,
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import UsageMeter from "../components/UsageMeter";

// Human labels for the entitlement flags, shown as the current plan's inclusions.
const FEATURE_LABELS = {
  optimize: "Image optimization & WebP conversion",
  altText: "AI alt text",
  filenameSeo: "SEO filenames",
  resize: "Resize & crop",
  scheduling: "Scheduled runs",
  watermark: "Watermarking",
  heic: "HEIC support",
  autoOptimize: "Auto-optimize new products",
  pageSpeed: "Page Speed reports",
  bulkExport: "Bulk image export",
  priority: "Priority processing",
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  let state = { hasActivePlan: false, plan: null, appHandle: undefined };
  try {
    state = await getBillingState(admin, session.shop);
  } catch (e) {
    if (e instanceof Response) throw e;
  }

  let usage = { imagesUsed: 0 };
  try { usage = await getUsage(session.shop); } catch { /* table not ready */ }

  const plan = state.plan || { name: "Free", tier: "free", monthlyImages: 100, features: {} };
  const included = Object.keys(FEATURE_LABELS).filter((k) => plan.features?.[k]);

  return {
    hasActivePlan: state.hasActivePlan,
    planName: plan.name,
    tier: plan.tier,
    monthlyImages: plan.monthlyImages,
    included,
    imagesUsed: usage.imagesUsed || 0,
    // Direct top-frame link target for the Change/Choose-plan CTA.
    pricingUrl: managedPricingUrl(session.shop, state.appHandle),
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  const state = await getBillingState(admin);
  const pricingUrl = managedPricingUrl(session.shop, state.appHandle);

  // Cancel: try the in-app cancel mutation first; if managed pricing blocks it,
  // fall back to the hosted page to cancel manually.
  if (actionType === "cancel") {
    const sub = state.activeSubscription;
    if (!sub) return { cancelled: true };
    try {
      await cancelSubscription(admin, sub.id);
      return { cancelled: true };
    } catch (e) {
      console.error("[BILLING] in-app cancel failed, redirecting:", e?.message);
      throw appBridgeRedirect(pricingUrl);
    }
  }

  return null;
};

export default function BillingPage() {
  const { hasActivePlan, planName, tier, monthlyImages, included, imagesUsed, pricingUrl } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isBusy = navigation.state !== "idle";

  const post = (actionType) => {
    const fd = new FormData();
    fd.append("actionType", actionType);
    submit(fd, { method: "post" });
  };

  const quota = monthlyImages || 0;
  const used = imagesUsed || 0;
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const fmt = (n) => Number(n).toLocaleString();

  return (
    <Page title="Velopixa — Billing" subtitle="Manage your plan">
      <BlockStack gap="400">
        <div className="vx-topbar">
          <span className="vx-topbar-badge" aria-hidden="true">◈</span>
          <div className="vx-topbar-text">
            <p className="vx-topbar-title">Plan &amp; usage</p>
            <p className="vx-topbar-sub">Billed securely through Shopify — change or cancel anytime</p>
          </div>
          <span className="vx-topbar-meta">{planName}</span>
        </div>

        {actionData?.cancelled && !hasActivePlan && (
          <Banner title="Subscription cancelled" tone="info">
            Your plan has been cancelled. Choose a plan any time to unlock more.
          </Banner>
        )}

        {/* Two-column split — the plan and its inclusions on the left, usage as
            a sidebar on the right, instead of one tall stacked card. */}
        <div className="vx-split">
          <BlockStack gap="400">
            <div className="vx-panel">
              <div className="vx-panel-head">
                <div>
                  <p className="vx-panel-eyebrow">Current plan</p>
                  <p className="vx-panel-title">{planName}</p>
                </div>
                <div className="vx-panel-actions">
                  {hasActivePlan
                    ? <Badge tone="success">Active</Badge>
                    : <Badge>Current</Badge>}
                </div>
              </div>
              <div className="vx-panel-body">
                <BlockStack gap="400">
                  <Text variant="bodySm" as="p" tone="subdued">
                    {`Up to ${fmt(quota)} optimized images per month`}
                  </Text>
                  <InlineStack gap="300" blockAlign="center">
                    <Button variant="primary" url={pricingUrl} target="_top">
                      {hasActivePlan ? "Change plan" : "Choose a plan"}
                    </Button>
                    {hasActivePlan && (
                      <Button tone="critical" variant="plain" loading={isBusy} onClick={() => post("cancel")}>
                        Cancel
                      </Button>
                    )}
                  </InlineStack>
                </BlockStack>
              </div>
            </div>

            <div className="vx-panel">
              <div className="vx-panel-head">
                <div>
                  <p className="vx-panel-eyebrow">Entitlements</p>
                  <p className="vx-panel-title">Included in your plan</p>
                </div>
              </div>
              <div className="vx-panel-body">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  {included.map((k) => (
                    <InlineStack key={k} gap="200" blockAlign="center" wrap={false}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: "#6d4aff",
                          boxShadow: "0 0 0 3px rgba(109, 74, 255, 0.16)",
                          flexShrink: 0,
                        }}
                      />
                      <Text variant="bodySm" as="span">{FEATURE_LABELS[k]}</Text>
                    </InlineStack>
                  ))}
                </div>
              </div>
            </div>
          </BlockStack>

          <BlockStack gap="400">
            <div className="vx-panel">
              <div className="vx-panel-head">
                <div>
                  <p className="vx-panel-eyebrow">This month</p>
                  <p className="vx-panel-title">Images optimized</p>
                </div>
              </div>
              <div className="vx-panel-body">
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="baseline">
                    <Text variant="headingLg" as="p">{fmt(used)}</Text>
                    <Text variant="bodySm" as="span" tone={pct >= 100 ? "critical" : "subdued"}>
                      {`of ${fmt(quota)}`}
                    </Text>
                  </InlineStack>
                  <UsageMeter used={used} quota={quota} />
                  <Text variant="bodySm" as="p" tone={pct >= 100 ? "critical" : "subdued"}>
                    {pct >= 100
                      ? "Monthly quota reached — upgrade to keep optimizing."
                      : `${pct}% of your monthly quota used`}
                  </Text>
                </BlockStack>
              </div>
            </div>

            <Divider />

            <Text variant="bodySm" as="p" tone="subdued">
              Plans and prices are managed securely on Shopify's billing page. Use “Change plan”
              to upgrade, downgrade, or switch between monthly and yearly — changes are reflected
              here automatically.
            </Text>
          </BlockStack>
        </div>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
