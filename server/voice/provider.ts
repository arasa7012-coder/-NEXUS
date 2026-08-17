export type NexusVoiceReadiness = { configured: boolean; provider: string | null; status: "NOT_CONFIGURED" | "READY"; welcomeTemplate: string; message: string };
export interface NexusVoiceProvider { readonly name: string; isConfigured(): boolean; getReadiness(): NexusVoiceReadiness; }

class NoVoiceProvider implements NexusVoiceProvider {
  readonly name = "NOT_CONFIGURED";
  isConfigured() { return false; }
  getReadiness(): NexusVoiceReadiness { return { configured: false, provider: null, status: "NOT_CONFIGURED", welcomeTemplate: "Welcome back, {userName}. Welcome to Nexus.", message: "Premium voice is not configured. No audio is generated or played." }; }
}

export function getNexusVoiceProvider(): NexusVoiceProvider { return new NoVoiceProvider(); }
export function buildNexusWelcomeText(userName: string | null | undefined) { const safeName = userName?.trim() || "Nexus user"; return `Welcome back, ${safeName}. Welcome to Nexus.`; }
