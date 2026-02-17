/**
 * LangChain Python community tools catalog.
 * Source: https://docs.langchain.com/oss/python/integrations/tools
 *
 * Each entry maps to a backend platform_tool config shape:
 * { toolkit, tool_name?, credential_service, auth: { type, kwarg } }
 */

export type CommunityTool = {
  id: string;
  name: string;
  description: string;
  category: CatalogCategory;
  /** Python dotted path to toolkit/tool class */
  toolkit: string;
  /** pip package to install (informational) */
  pip: string;
  /** Docs link */
  docsUrl: string;
  /** Credential service name (matches credentials.service) */
  credentialService: string;
  /** Auth config defaults */
  auth: { type: "token" | "api_key" | "google_resource" | "env"; kwarg: string };
  /** Free/Paid indicator */
  pricing: string;
};

export type CatalogCategory =
  | "search"
  | "productivity"
  | "web"
  | "database"
  | "finance"
  | "code"
  | "knowledge"
  | "communication"
  | "other";

export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  search: "Search",
  productivity: "Productivity",
  web: "Web Browsing",
  database: "Database",
  finance: "Finance",
  code: "Code Interpreter",
  knowledge: "Knowledge & Research",
  communication: "Communication",
  other: "Other",
};

export const COMMUNITY_TOOLS: CommunityTool[] = [
  // Verified toolkit entries (compatible with backend loader expecting get_tools()).
  // For the broader LangChain ecosystem, use the Custom form.
  {
    id: "gmail",
    name: "Gmail Toolkit",
    description: "Send, search, and manage Gmail messages. Full toolkit with multiple tools.",
    category: "productivity",
    toolkit: "langchain_google_community.gmail.toolkit.GmailToolkit",
    pip: "langchain-google-community[gmail]",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/google_gmail",
    credentialService: "google",
    auth: { type: "google_resource", kwarg: "api_resource" },
    pricing: "Free (250 quota units/s)",
  },
  {
    id: "slack",
    name: "Slack Toolkit",
    description: "Send messages, manage channels, and interact with Slack workspaces.",
    category: "productivity",
    toolkit: "langchain_community.agent_toolkits.slack.toolkit.SlackToolkit",
    pip: "langchain-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/slack",
    credentialService: "slack",
    auth: { type: "env", kwarg: "SLACK_USER_TOKEN" },
    pricing: "Free",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Manage Stripe customers, charges, and subscriptions.",
    category: "finance",
    toolkit: "langchain_community.agent_toolkits.stripe.toolkit.StripeToolkit",
    pip: "langchain-community stripe",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/stripe",
    credentialService: "stripe",
    auth: { type: "env", kwarg: "STRIPE_SECRET_KEY" },
    pricing: "Pay-as-you-go",
  },
];
