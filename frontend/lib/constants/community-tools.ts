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
  // ── Search ──────────────────────────────────
  {
    id: "tavily_search",
    name: "Tavily Search",
    description: "AI-optimized search engine. Returns URL, content, title, images, and answers.",
    category: "search",
    toolkit: "langchain_community.tools.tavily_search.TavilySearchResults",
    pip: "langchain-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/tavily_search",
    credentialService: "tavily",
    auth: { type: "env", kwarg: "TAVILY_API_KEY" },
    pricing: "1000 free/month",
  },
  {
    id: "duckduckgo_search",
    name: "DuckDuckGo Search",
    description: "Free web search via DuckDuckGo. No API key required.",
    category: "search",
    toolkit: "langchain_community.tools.ddg_search.DuckDuckGoSearchRun",
    pip: "langchain-community duckduckgo-search",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/ddg",
    credentialService: "",
    auth: { type: "token", kwarg: "" },
    pricing: "Free",
  },
  {
    id: "brave_search",
    name: "Brave Search",
    description: "Privacy-focused web search. Returns URL, snippet, and title.",
    category: "search",
    toolkit: "langchain_community.tools.brave_search.BraveSearch",
    pip: "langchain-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/brave_search",
    credentialService: "brave",
    auth: { type: "env", kwarg: "BRAVE_SEARCH_API_KEY" },
    pricing: "Free",
  },
  {
    id: "google_serper",
    name: "Google Serper",
    description: "Google Search via Serper API. Returns URL, snippet, title, site links.",
    category: "search",
    toolkit: "langchain_community.utilities.google_serper.GoogleSerperAPIWrapper",
    pip: "langchain-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/google_serper",
    credentialService: "serper",
    auth: { type: "env", kwarg: "SERPER_API_KEY" },
    pricing: "Free tier",
  },
  {
    id: "exa_search",
    name: "Exa Search",
    description: "Neural search engine. Returns URL, author, title, published date.",
    category: "search",
    toolkit: "langchain_exa.ExaSearchResults",
    pip: "langchain-exa",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/exa_search",
    credentialService: "exa",
    auth: { type: "env", kwarg: "EXA_API_KEY" },
    pricing: "1000 free/month",
  },
  {
    id: "searxng_search",
    name: "SearxNG Search",
    description: "Self-hosted meta search engine. Free and privacy-respecting.",
    category: "search",
    toolkit: "langchain_community.utilities.searx_search.SearxSearchWrapper",
    pip: "langchain-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/searx_search",
    credentialService: "",
    auth: { type: "token", kwarg: "" },
    pricing: "Free (self-hosted)",
  },
  {
    id: "jina_search",
    name: "Jina Search",
    description: "AI search with page content extraction. 1M free response tokens.",
    category: "search",
    toolkit: "langchain_community.tools.jina_search.JinaSearch",
    pip: "langchain-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/jina_search",
    credentialService: "jina",
    auth: { type: "env", kwarg: "JINA_API_KEY" },
    pricing: "1M tokens free",
  },

  // ── Productivity ────────────────────────────
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
    id: "github",
    name: "GitHub Toolkit",
    description: "Manage GitHub repos, issues, PRs, and files.",
    category: "productivity",
    toolkit: "langchain_community.agent_toolkits.github.toolkit.GitHubToolkit",
    pip: "langchain-community pygithub",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/github",
    credentialService: "github",
    auth: { type: "env", kwarg: "GITHUB_APP_PRIVATE_KEY" },
    pricing: "Free",
  },
  {
    id: "gitlab",
    name: "GitLab Toolkit",
    description: "Manage GitLab repos, issues, merge requests, and files.",
    category: "productivity",
    toolkit: "langchain_community.agent_toolkits.gitlab.toolkit.GitLabToolkit",
    pip: "langchain-community python-gitlab",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/gitlab",
    credentialService: "gitlab",
    auth: { type: "env", kwarg: "GITLAB_PERSONAL_ACCESS_TOKEN" },
    pricing: "Free",
  },
  {
    id: "jira",
    name: "Jira Toolkit",
    description: "Create and manage Jira issues, search, and update tickets.",
    category: "productivity",
    toolkit: "langchain_community.agent_toolkits.jira.toolkit.JiraToolkit",
    pip: "langchain-community atlassian-python-api",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/jira",
    credentialService: "jira",
    auth: { type: "env", kwarg: "JIRA_API_TOKEN" },
    pricing: "Free",
  },
  {
    id: "office365",
    name: "Office365 Toolkit",
    description: "Manage Outlook email, calendar events, and OneDrive files.",
    category: "productivity",
    toolkit: "langchain_community.agent_toolkits.office365.toolkit.O365Toolkit",
    pip: "langchain-community O365",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/office365",
    credentialService: "office365",
    auth: { type: "env", kwarg: "O365_CLIENT_SECRET" },
    pricing: "Free with Office365",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Create, search, and manage Google Calendar events.",
    category: "productivity",
    toolkit: "langchain_google_community.calendar.toolkit.GoogleCalendarToolkit",
    pip: "langchain-google-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/google_calendar",
    credentialService: "google",
    auth: { type: "google_resource", kwarg: "api_resource" },
    pricing: "Free",
  },
  {
    id: "google_drive",
    name: "Google Drive",
    description: "Search and retrieve files from Google Drive.",
    category: "productivity",
    toolkit: "langchain_google_community.drive.GoogleDriveSearchTool",
    pip: "langchain-google-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/google_drive",
    credentialService: "google",
    auth: { type: "google_resource", kwarg: "api_resource" },
    pricing: "Free",
  },

  // ── Communication ───────────────────────────
  {
    id: "twilio",
    name: "Twilio",
    description: "Send SMS and make phone calls via Twilio.",
    category: "communication",
    toolkit: "langchain_community.tools.twilio.TwilioAPIWrapper",
    pip: "langchain-community twilio",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/twilio",
    credentialService: "twilio",
    auth: { type: "env", kwarg: "TWILIO_AUTH_TOKEN" },
    pricing: "Pay-as-you-go",
  },
  {
    id: "discord",
    name: "Discord",
    description: "Send messages and interact with Discord servers.",
    category: "communication",
    toolkit: "langchain_community.tools.discord.DiscordSendMessages",
    pip: "langchain-community discord.py",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/discord",
    credentialService: "discord",
    auth: { type: "env", kwarg: "DISCORD_BOT_TOKEN" },
    pricing: "Free",
  },

  // ── Web Browsing ────────────────────────────
  {
    id: "playwright",
    name: "Playwright Browser",
    description: "Automate web browsing: navigate, click, fill forms, extract data.",
    category: "web",
    toolkit: "langchain_community.agent_toolkits.playwright.toolkit.PlayWrightBrowserToolkit",
    pip: "langchain-community playwright",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/playwright",
    credentialService: "",
    auth: { type: "token", kwarg: "" },
    pricing: "Free",
  },
  {
    id: "requests",
    name: "Requests Toolkit",
    description: "Make HTTP GET/POST/PUT/DELETE requests to any API.",
    category: "web",
    toolkit: "langchain_community.agent_toolkits.openapi.toolkit.RequestsToolkit",
    pip: "langchain-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/requests",
    credentialService: "",
    auth: { type: "token", kwarg: "" },
    pricing: "Free",
  },

  // ── Database ────────────────────────────────
  {
    id: "sql_database",
    name: "SQL Database",
    description: "Query and explore SQL databases with natural language.",
    category: "database",
    toolkit: "langchain_community.agent_toolkits.sql.toolkit.SQLDatabaseToolkit",
    pip: "langchain-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/sql_database",
    credentialService: "database",
    auth: { type: "token", kwarg: "" },
    pricing: "Free",
  },

  // ── Finance ─────────────────────────────────
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
  {
    id: "yahoo_finance",
    name: "Yahoo Finance",
    description: "Fetch stock prices, financial news, and market data.",
    category: "finance",
    toolkit: "langchain_community.tools.yahoo_finance_news.YahooFinanceNewsTool",
    pip: "langchain-community yfinance",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/yahoo_finance_news",
    credentialService: "",
    auth: { type: "token", kwarg: "" },
    pricing: "Free",
  },

  // ── Knowledge & Research ────────────────────
  {
    id: "wikipedia",
    name: "Wikipedia",
    description: "Search and retrieve Wikipedia articles.",
    category: "knowledge",
    toolkit: "langchain_community.tools.wikipedia.WikipediaQueryRun",
    pip: "langchain-community wikipedia",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/wikipedia",
    credentialService: "",
    auth: { type: "token", kwarg: "" },
    pricing: "Free",
  },
  {
    id: "arxiv",
    name: "ArXiv",
    description: "Search and retrieve academic papers from ArXiv.",
    category: "knowledge",
    toolkit: "langchain_community.tools.arxiv.ArxivQueryRun",
    pip: "langchain-community arxiv",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/arxiv",
    credentialService: "",
    auth: { type: "token", kwarg: "" },
    pricing: "Free",
  },
  {
    id: "pubmed",
    name: "PubMed",
    description: "Search biomedical literature from PubMed/NCBI.",
    category: "knowledge",
    toolkit: "langchain_community.tools.pubmed.PubmedQueryRun",
    pip: "langchain-community xmltodict",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/pubmed",
    credentialService: "",
    auth: { type: "token", kwarg: "" },
    pricing: "Free",
  },
  {
    id: "wolfram_alpha",
    name: "Wolfram Alpha",
    description: "Computational knowledge engine for math, science, and data queries.",
    category: "knowledge",
    toolkit: "langchain_community.tools.wolfram_alpha.WolframAlphaQueryRun",
    pip: "langchain-community wolframalpha",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/wolfram_alpha",
    credentialService: "wolfram",
    auth: { type: "env", kwarg: "WOLFRAM_ALPHA_APPID" },
    pricing: "Free tier",
  },
  {
    id: "stackexchange",
    name: "StackExchange",
    description: "Search StackOverflow and other StackExchange sites.",
    category: "knowledge",
    toolkit: "langchain_community.tools.stackexchange.StackExchangeTool",
    pip: "langchain-community stackapi",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/stackexchange",
    credentialService: "",
    auth: { type: "token", kwarg: "" },
    pricing: "Free",
  },

  // ── Code Interpreter ────────────────────────
  {
    id: "python_repl",
    name: "Python REPL",
    description: "Execute Python code in a sandboxed environment.",
    category: "code",
    toolkit: "langchain_community.tools.python.PythonREPLTool",
    pip: "langchain-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/python",
    credentialService: "",
    auth: { type: "token", kwarg: "" },
    pricing: "Free",
  },
  {
    id: "shell",
    name: "Shell (bash)",
    description: "Execute shell commands. Use with caution in production.",
    category: "code",
    toolkit: "langchain_community.tools.shell.ShellTool",
    pip: "langchain-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/bash",
    credentialService: "",
    auth: { type: "token", kwarg: "" },
    pricing: "Free",
  },

  // ── Other ───────────────────────────────────
  {
    id: "openweathermap",
    name: "OpenWeatherMap",
    description: "Get current weather data for any location.",
    category: "other",
    toolkit: "langchain_community.tools.openweathermap.OpenWeatherMapQueryRun",
    pip: "langchain-community pyowm",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/openweathermap",
    credentialService: "openweathermap",
    auth: { type: "env", kwarg: "OPENWEATHERMAP_API_KEY" },
    pricing: "Free tier",
  },
  {
    id: "dalle",
    name: "DALL-E Image Generator",
    description: "Generate images from text prompts via OpenAI DALL-E.",
    category: "other",
    toolkit: "langchain_community.tools.dalle_image_generator.DallEAPIWrapper",
    pip: "langchain-community",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/dalle_image_generator",
    credentialService: "openai",
    auth: { type: "env", kwarg: "OPENAI_API_KEY" },
    pricing: "Paid",
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Search and retrieve YouTube video transcripts and metadata.",
    category: "other",
    toolkit: "langchain_community.tools.youtube.search.YouTubeSearchTool",
    pip: "langchain-community youtube_search youtube-transcript-api",
    docsUrl: "https://docs.langchain.com/oss/python/integrations/tools/youtube",
    credentialService: "",
    auth: { type: "token", kwarg: "" },
    pricing: "Free",
  },
];
