export function readCredentials(source: unknown): {
  keys: Partial<
    Record<
      | 'GEMINI_API_KEY'
      | 'MISTRAL_API_KEY'
      | 'KIRA_API_KEY'
      | 'OPENROUTER_API_KEY'
      | 'LLAMA_CLOUD_API_KEY'
      | 'TAVILY_API_KEY'
      | 'OPENAI_API_KEY',
      string
    >
  >;
  status: string;
};
