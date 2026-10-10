import { useNavigate, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getBillingStateCached } from "../billing.server";
import { getUsage } from "../usage.server";
import { entitled } from "../plans.server";
import db from "../db.server";
import {
  Page,
  Button,
  Badge,
  Text,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";
import UsageMeter from "../components/UsageMeter";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  let plan = null;
  try {
    plan = (await getBillingStateCached(admin, session.shop)).plan;
  } catch (e) {
    if (e instanceof Response) throw e; // let re-auth propagate
  }

  let usage = { imagesUsed: 0 };
  let autoOptimize = false;
  try {
    usage = await getUsage(session.shop);
    const settings = await db.shopSettings.findUnique({ where: { shop: session.shop } });
    autoOptimize = settings?.autoOptimize ?? false;
  } catch { /* usage/settings tables not ready — defaults */ }

  return {
    plan: {
      name: plan?.name || "Free",
      tier: plan?.tier || "free",
      monthlyImages: plan?.monthlyImages ?? 100,
      altText: entitled(plan, "altText"),
      pageSpeed: entitled(plan, "pageSpeed"),
      autoOptimizeAllowed: entitled(plan, "autoOptimize"),
    },
    usage,
    autoOptimize,
  };
};

export default function Index() {
  const navigate = useNavigate();
  const { plan, usage, autoOptimize } = useLoaderData();

  const quota = plan.monthlyImages || 0;
  const used = usage?.imagesUsed || 0;
  const remaining = Math.max(0, quota - used);
  const fmt = (n) => Number(n).toLocaleString();
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

  const autoStatus = !plan.autoOptimizeAllowed
    ? { label: "Growth & up", tone: "attention" }
    : autoOptimize
      ? { label: "On", tone: "success" }
      : { label: "Off", tone: undefined };

  // Tool rows — a vertical list rather than a tile grid, so the icon, the
  // description, the availability chip and the action all sit on one scan line
  // and adding a fifth tool never leaves an orphaned half-row.
  const tools = [
    {
      icon: "◉",
      title: "Image Optimizer",
      desc: "Compress & convert product images to WebP — up to 70% smaller, originals replaced safely.",
      cta: "Open optimizer",
      onClick: () => navigate("/app/productoptimization"),
      available: true,
      chip: { label: "Included", tone: "on" },
    },
    {
      icon: "✦",
      title: "AI Alt Text",
      desc: "Generate SEO alt text for every image with AI vision, then bulk-apply in one click.",
      cta: plan.altText ? "Generate alt text" : "Upgrade to Starter",
      onClick: () => navigate(plan.altText ? "/app/alttextsuggestions" : "/app/billing"),
      available: plan.altText,
      chip: plan.altText
        ? { label: "Included", tone: "on" }
        : { label: "Starter & up", tone: "attention" },
    },
    {
      icon: "⟳",
      title: "Auto-optimize new products",
      desc: "Set & forget — every newly created product gets optimized automatically in the background.",
      cta: plan.autoOptimizeAllowed ? "Manage" : "Upgrade to Growth",
      onClick: () => navigate(plan.autoOptimizeAllowed ? "/app/productoptimization" : "/app/billing"),
      available: plan.autoOptimizeAllowed,
      chip: !plan.autoOptimizeAllowed
        ? { label: "Growth & up", tone: "attention" }
        : autoOptimize
          ? { label: "On", tone: "on" }
          : { label: "Off", tone: "off" },
    },
    {
      icon: "▲",
      title: "Page Speed Reports",
      desc: "Track Core Web Vitals (LCP, CLS, TBT) and see before/after gains per product page.",
      cta: plan.pageSpeed ? "View reports" : "Upgrade to Growth",
      onClick: () => navigate(plan.pageSpeed ? "/app/pagespeedimpactreports" : "/app/billing"),
      available: plan.pageSpeed,
      chip: plan.pageSpeed
        ? { label: "Included", tone: "on" }
        : { label: "Growth & up", tone: "attention" },
    },
  ];

  // The headline numbers live INSIDE the hero rather than in a separate tile
  // row below it, so the first screen carries both the pitch and the state.
  const heroStats = [
    { label: "Current plan", value: plan.name },
    { label: "Images used", value: fmt(used) },
    { label: "Images left", value: fmt(remaining) },
    { label: "Auto-optimize", value: autoStatus.label },
  ];

  return (
    <Page>
      {/* Hero — ink panel, bottom underline accent, inline stat strip */}
      <div className="vx-hero">
        <InlineStack align="space-between" blockAlign="center" wrap={false} gap="600">
          <BlockStack gap="300">
            <span className="vx-hero-tag">Velopixa</span>
            <div className="vx-hero-copy">
              <h1>Lighter images. Faster storefront.</h1>
              <p>Compress and convert your catalog, auto-generate SEO alt text, and track the page-speed gains — all from one place.</p>
            </div>
          </BlockStack>
          <Button variant="primary" size="large" onClick={() => navigate("/app/productoptimization")}>
            Optimize images
          </Button>
        </InlineStack>

        <div className="vx-hero-stats">
          {heroStats.map((stat) => (
            <div key={stat.label} className="vx-hero-stat">
              <p className="vx-hero-stat-label">{stat.label}</p>
              <p className="vx-hero-stat-value">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column split: the tool list leads and usage sits alongside it as a
          sidebar, rather than the siblings' stacked metrics → usage → tiles. */}
      <div className="vx-split">
        <div className="vx-panel">
          <div className="vx-panel-head">
            <div>
              <p className="vx-panel-eyebrow">Toolkit</p>
              <p className="vx-panel-title">What you can do</p>
            </div>
          </div>
          <div className="vx-panel-body">
            <div className="vx-tools">
              {tools.map((t) => (
                <div key={t.title} className={t.available ? "vx-tool" : "vx-tool is-locked"}>
                  <div className="vx-tool-head">
                    <span className="vx-tool-icon" aria-hidden="true">{t.icon}</span>
                    <div className="vx-tool-body">
                      <p className="vx-tool-title">{t.title}</p>
                      <p className="vx-tool-desc">{t.desc}</p>
                    </div>
                  </div>
                  <div className="vx-tool-foot">
                    <span className={`vx-tool-chip vx-tool-chip--${t.chip.tone}`}>{t.chip.label}</span>
                    <Button variant={t.available ? "primary" : "secondary"} onClick={t.onClick}>
                      {t.cta}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="vx-panel">
          <div className="vx-panel-head">
            <div>
              <p className="vx-panel-eyebrow">This month</p>
              <p className="vx-panel-title">Image usage</p>
            </div>
            <div className="vx-panel-actions">
              <Badge tone={plan.tier === "free" ? undefined : "success"}>{plan.name}</Badge>
            </div>
          </div>
          <div className="vx-panel-body">
            <BlockStack gap="400">
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="baseline">
                  <Text variant="headingLg" as="p">{fmt(used)}</Text>
                  <Text variant="bodySm" as="span" tone="subdued">{`of ${fmt(quota)}`}</Text>
                </InlineStack>
                <UsageMeter used={used} quota={quota} />
                <Text variant="bodySm" as="p" tone="subdued">
                  {`${pct}% used · ${fmt(remaining)} remaining`}
                </Text>
              </BlockStack>

              <Button fullWidth onClick={() => navigate("/app/billing")}>Manage plan</Button>
            </BlockStack>
          </div>
        </div>
      </div>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
