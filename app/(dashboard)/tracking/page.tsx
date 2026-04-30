"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { NoBotSelected } from "@/components/no-bot-selected"
import { useBots } from "@/lib/bot-context"
import { useAuth } from "@/lib/auth-context"
import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { 
  Zap, GitBranch, BarChart3, Globe, Plus, Facebook, 
  Loader2, Trash2, RefreshCw, Eye, EyeOff, AlertCircle,
  Settings2, Check, FlaskConical
} from "lucide-react"

interface TrackingProfile {
  id: string
  name: string
  pixel_id: string | null
  access_token: string | null
  utmify_token: string | null
  events: string[]
  linked_flows: string[]
  active: boolean
  created_at: string
}

interface Flow {
  id: string
  name: string
  status: string
}

const EVENTS = [
  { id: "Lead", label: "Lead", description: "Entrada no bot", icon: "👤" },
  { id: "ViewContent", label: "ViewContent", description: "Visualiza oferta", icon: "👁️" },
  { id: "InitiateCheckout", label: "InitiateCheckout", description: "Clique no pagamento", icon: "🛒" },
  { id: "Purchase", label: "Purchase", description: "Pagamento aprovado", icon: "✅" },
]

export default function TrackingPage() {
  const { selectedBot } = useBots()
  const { session } = useAuth()
  const [profiles, setProfiles] = useState<TrackingProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showPlatformDialog, setShowPlatformDialog] = useState(false)
  const [showFacebookDialog, setShowFacebookDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Token visibility
  const [showAccessToken, setShowAccessToken] = useState(false)
  const [showUtmifyToken, setShowUtmifyToken] = useState(false)
  
  // Connection test state
  const [isTesting, setIsTesting] = useState(false)
  const [testEventCode, setTestEventCode] = useState("")
  
  // Flows from database
  const [availableFlows, setAvailableFlows] = useState<Flow[]>([])
  const [isLoadingFlows, setIsLoadingFlows] = useState(false)
  
  // Form state
  const [profileName, setProfileName] = useState("")
  const [pixelId, setPixelId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [utmifyToken, setUtmifyToken] = useState("")
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["Lead", "ViewContent", "InitiateCheckout", "Purchase"])
  const [selectedFlows, setSelectedFlows] = useState<string[]>([])

  // Fetch profiles from API
  const fetchProfiles = useCallback(async () => {
    if (!selectedBot?.id) return
    
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/tracking/profiles?bot_id=${selectedBot.id}`)
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar perfis")
      }
      
      if (data.profiles) {
        setProfiles(data.profiles)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar perfis"
      setError(message)
      toast.error(message)
      console.error("[v0] Error fetching profiles:", err)
    } finally {
      setIsLoading(false)
    }
  }, [selectedBot?.id])

  // Fetch profiles on mount
  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])
  
  // Fetch flows via internal API (consistent with the rest of the app)
  useEffect(() => {
    async function fetchFlows() {
      if (!session?.userId) return
      
      setIsLoadingFlows(true)
      try {
        const res = await fetch(`/api/fluxo/list?userId=${session.userId}`)
        const data = await res.json()
        if (res.ok && Array.isArray(data.flows)) {
          setAvailableFlows(data.flows)
        }
      } catch (err) {
        console.error("[v0] Error fetching flows:", err)
      } finally {
        setIsLoadingFlows(false)
      }
    }
    
    fetchFlows()
  }, [session?.userId])

  if (!selectedBot) {
    return <NoBotSelected />
  }

  const handleSelectPlatform = () => {
    setShowPlatformDialog(false)
    setShowFacebookDialog(true)
  }

  const handleCreateProfile = async () => {
    if (!profileName.trim()) {
      toast.error("Nome do perfil e obrigatorio")
      return
    }
    
    // Validar que pelo menos um metodo de tracking esta configurado
    if (!pixelId && !utmifyToken) {
      toast.error("Configure pelo menos o Pixel ID do Facebook ou o Token do UTMify")
      return
    }
    
    setIsSaving(true)
    try {
      console.log("[v0] Creating profile:", { profileName, pixelId: !!pixelId, accessToken: !!accessToken, utmifyToken: !!utmifyToken })
      
      const response = await fetch("/api/tracking/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileName,
          botId: selectedBot.id,
          pixelId: pixelId || null,
          accessToken: accessToken || null,
          utmifyToken: utmifyToken || null,
          events: selectedEvents,
          linkedFlows: selectedFlows,
        }),
      })
      
      const data = await response.json()
      console.log("[v0] API response:", data)
      
      if (!response.ok) {
        throw new Error(data.error || "Erro ao criar perfil")
      }
      
      if (data.profile) {
        setProfiles([data.profile, ...profiles])
        resetForm()
        setShowFacebookDialog(false)
        toast.success("Perfil criado com sucesso!")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao criar perfil"
      toast.error(message)
      console.error("[v0] Error creating profile:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    setProfileName("")
    setPixelId("")
    setAccessToken("")
    setUtmifyToken("")
    setSelectedEvents(["Lead", "ViewContent", "InitiateCheckout", "Purchase"])
    setSelectedFlows([])
    setShowAccessToken(false)
    setShowUtmifyToken(false)
    setTestEventCode("")
  }

  const handleTestConnection = async () => {
    if (!pixelId && !accessToken && !utmifyToken) {
      toast.error("Preencha o Pixel + Access Token ou o UTMify Token para testar")
      return
    }
    setIsTesting(true)
    try {
      const res = await fetch("/api/tracking/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pixelId: pixelId || null,
          accessToken: accessToken || null,
          utmifyToken: utmifyToken || null,
          testEventCode: testEventCode || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao testar")

      const { meta, utmify } = data.results || {}
      if (meta) {
        if (meta.ok) toast.success(`Meta CAPI: ${meta.message}`)
        else toast.error(`Meta CAPI: ${meta.message}`)
      }
      if (utmify) {
        if (utmify.ok) toast.success(`UTMify: ${utmify.message}`)
        else toast.error(`UTMify: ${utmify.message}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao testar conexao")
    } finally {
      setIsTesting(false)
    }
  }

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev => 
      prev.includes(eventId) 
        ? prev.filter(e => e !== eventId)
        : [...prev, eventId]
    )
  }

  const toggleFlow = (flowId: string) => {
    setSelectedFlows(prev => 
      prev.includes(flowId) 
        ? prev.filter(f => f !== flowId)
        : [...prev, flowId]
    )
  }

  const toggleProfileActive = async (profileId: string, currentActive: boolean) => {
    try {
      const response = await fetch("/api/tracking/profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: profileId, active: !currentActive }),
      })
      
      if (response.ok) {
        setProfiles(prev => 
          prev.map(p => p.id === profileId ? { ...p, active: !currentActive } : p)
        )
        toast.success(currentActive ? "Perfil desativado" : "Perfil ativado")
      } else {
        const data = await response.json()
        throw new Error(data.error || "Erro ao atualizar perfil")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar perfil"
      toast.error(message)
      console.error("[v0] Error toggling profile:", err)
    }
  }

  const deleteProfile = async (profileId: string) => {
    if (!confirm("Tem certeza que deseja excluir este perfil?")) return
    
    try {
      const response = await fetch(`/api/tracking/profiles?id=${profileId}`, {
        method: "DELETE",
      })
      
      if (response.ok) {
        setProfiles(prev => prev.filter(p => p.id !== profileId))
        toast.success("Perfil excluido")
      } else {
        const data = await response.json()
        throw new Error(data.error || "Erro ao excluir perfil")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao excluir perfil"
      toast.error(message)
      console.error("[v0] Error deleting profile:", err)
    }
  }

  const activeProfiles = profiles.filter(p => p.active).length
  const linkedFlowsCount = profiles.reduce((acc, p) => acc + (p.linked_flows?.length || 0), 0)
  const totalEvents = profiles.reduce((acc, p) => acc + (p.events?.length || 0), 0)

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 md:p-8 bg-background min-h-full">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-primary-foreground" />
                </div>
                Trackeamento
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Gerencie perfis de rastreamento para Meta Ads e UTMify
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={fetchProfiles}
                disabled={isLoading}
                size="sm"
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button 
                onClick={() => setShowPlatformDialog(true)}
                size="sm"
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Novo Perfil
              </Button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 mb-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Erro ao carregar dados</p>
                <p className="text-sm text-destructive/80 mt-0.5">{error}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Verifique se a tabela tracking_profiles existe no banco de dados. 
                  Execute o script SQL em scripts/setup-tracking-tables.sql
                </p>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 hover:border-primary/30 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{activeProfiles}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Perfis Ativos</p>
              </div>
            </div>
            
            <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 hover:border-emerald-500/30 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{linkedFlowsCount}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Fluxos Vinculados</p>
              </div>
            </div>
            
            <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 hover:border-amber-500/30 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Settings2 className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalEvents}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Eventos Configurados</p>
              </div>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-primary/5 border border-primary/10 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-foreground font-medium mb-1">Como funciona o Tracking Dragon</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Os eventos sao disparados automaticamente via backend quando usuarios entram no bot (Lead), 
                  visualizam ofertas (ViewContent), clicam no pagamento (InitiateCheckout) e quando o pagamento 
                  e aprovado (Purchase). As UTMs sao capturadas do link do Telegram e preservadas para atribuicao correta.
                </p>
              </div>
            </div>
          </div>

          {/* Profiles List */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Perfis de Rastreamento</h2>
              <span className="text-xs text-muted-foreground">{profiles.length} perfil(is)</span>
            </div>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : profiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <BarChart3 className="w-7 h-7 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">Nenhum perfil criado</h3>
                <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
                  Crie seu primeiro perfil de trackeamento para comecar a rastrear conversoes no Meta Ads e UTMify
                </p>
                <Button 
                  onClick={() => setShowPlatformDialog(true)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Criar Primeiro Perfil
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {profiles.map((profile) => (
                  <div key={profile.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        profile.active ? "bg-primary/10" : "bg-muted"
                      }`}>
                        <Facebook className={`w-5 h-5 ${profile.active ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm">{profile.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {profile.events?.length || 0} eventos
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {profile.linked_flows?.length || 0} fluxos
                          </span>
                          {profile.pixel_id && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-xs text-primary">Meta</span>
                            </>
                          )}
                          {profile.utmify_token && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-xs text-emerald-400">UTMify</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        profile.active 
                          ? "bg-emerald-500/10 text-emerald-400" 
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {profile.active ? (
                          <><Check className="w-3 h-3" /> Ativo</>
                        ) : (
                          "Inativo"
                        )}
                      </div>
                      <Switch 
                        checked={profile.active} 
                        onCheckedChange={() => toggleProfileActive(profile.id, profile.active)}
                        className="data-[state=checked]:bg-primary"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteProfile(profile.id)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Platform Selection Dialog */}
      <Dialog open={showPlatformDialog} onOpenChange={setShowPlatformDialog}>
        <DialogContent className="bg-card border border-border sm:max-w-md rounded-2xl p-0">
          <DialogHeader className="p-6 pb-4">
            <DialogTitle className="text-foreground text-lg font-semibold">Escolha a Plataforma</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Selecione a plataforma de anuncios para o novo perfil
            </p>
          </DialogHeader>
          
          <div className="px-6 pb-6">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {/* Facebook */}
              <button 
                onClick={handleSelectPlatform}
                className="flex flex-col items-center p-5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                  <Facebook className="w-6 h-6 text-primary" />
                </div>
                <span className="text-foreground font-medium text-sm">Facebook</span>
                <span className="text-xs text-muted-foreground mt-0.5">Pixel + CAPI</span>
              </button>
              
              {/* TikTok */}
              <div className="flex flex-col items-center p-5 rounded-xl border border-border bg-muted/30 opacity-50 cursor-not-allowed">
                <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center mb-2">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 text-pink-500" fill="currentColor">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                  </svg>
                </div>
                <span className="text-muted-foreground font-medium text-sm">TikTok</span>
                <span className="text-xs text-muted-foreground/70 mt-0.5">Em breve</span>
              </div>
              
              {/* Kwai */}
              <div className="flex flex-col items-center p-5 rounded-xl border border-border bg-muted/30 opacity-50 cursor-not-allowed">
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-2">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 text-orange-500" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="4"/>
                  </svg>
                </div>
                <span className="text-muted-foreground font-medium text-sm">Kwai</span>
                <span className="text-xs text-muted-foreground/70 mt-0.5">Em breve</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Facebook Profile Creation Dialog */}
      <Dialog open={showFacebookDialog} onOpenChange={setShowFacebookDialog}>
        <DialogContent className="bg-card border border-border sm:max-w-lg rounded-2xl p-0 max-h-[90vh] overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Facebook className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-foreground text-lg font-semibold">Novo Perfil Facebook</DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Configure Pixel, Conversion API e UTMify
                </p>
              </div>
            </div>
          </DialogHeader>
          
          <ScrollArea className="max-h-[calc(90vh-180px)]">
            <div className="p-6 space-y-6">
              {/* Profile Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Nome do Perfil <span className="text-destructive">*</span></label>
                <Input 
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Ex: Pixel Principal, Campanha X..."
                  className="bg-input border-border text-foreground placeholder:text-muted-foreground h-11 rounded-xl"
                />
              </div>

              {/* Facebook Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border"></div>
                  <span className="text-xs font-medium text-primary uppercase tracking-wider px-2 py-1 bg-primary/10 rounded-full">
                    Meta Conversion API
                  </span>
                  <div className="flex-1 h-px bg-border"></div>
                </div>
                
                <div className="space-y-4 bg-muted/30 rounded-xl p-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Pixel ID</label>
                    <Input 
                      value={pixelId}
                      onChange={(e) => setPixelId(e.target.value)}
                      placeholder="Ex: 847291038475629"
                      className="bg-input border-border text-foreground placeholder:text-muted-foreground h-11 rounded-xl font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Access Token (CAPI)</label>
                    <div className="relative">
                      <Input 
                        type={showAccessToken ? "text" : "password"}
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        placeholder="Token para API de Conversoes"
                        className="bg-input border-border text-foreground placeholder:text-muted-foreground h-11 rounded-xl pr-10 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAccessToken(!showAccessToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Business Manager → Events Manager → Data Sources → Settings
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Test Event Code (opcional)</label>
                    <Input
                      value={testEventCode}
                      onChange={(e) => setTestEventCode(e.target.value)}
                      placeholder="TEST12345"
                      className="bg-input border-border text-foreground placeholder:text-muted-foreground h-11 rounded-xl font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use para validar na aba &quot;Test Events&quot; do Events Manager
                    </p>
                  </div>
                </div>
              </div>

              {/* UTMify Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border"></div>
                  <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider px-2 py-1 bg-emerald-500/10 rounded-full">
                    UTMify
                  </span>
                  <div className="flex-1 h-px bg-border"></div>
                </div>
                
                <div className="bg-muted/30 rounded-xl p-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">UTMify Token</label>
                    <div className="relative">
                      <Input 
                        type={showUtmifyToken ? "text" : "password"}
                        value={utmifyToken}
                        onChange={(e) => setUtmifyToken(e.target.value)}
                        placeholder="Seu token da API UTMify"
                        className="bg-input border-border text-foreground placeholder:text-muted-foreground h-11 rounded-xl pr-10 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowUtmifyToken(!showUtmifyToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showUtmifyToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Events Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border"></div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Eventos a Disparar
                  </span>
                  <div className="flex-1 h-px bg-border"></div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {EVENTS.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => toggleEvent(event.id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                        selectedEvents.includes(event.id)
                          ? "bg-primary/10 border-primary/30"
                          : "bg-muted/30 border-border hover:border-border/80"
                      }`}
                    >
                      <Checkbox 
                        checked={selectedEvents.includes(event.id)}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary border-border"
                      />
                      <div>
                        <span className={`text-sm font-medium ${selectedEvents.includes(event.id) ? "text-primary" : "text-foreground"}`}>
                          {event.label}
                        </span>
                        <p className="text-xs text-muted-foreground">{event.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Linked Flows Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border"></div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Fluxos Vinculados (Opcional)
                  </span>
                  <div className="flex-1 h-px bg-border"></div>
                </div>
                
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {isLoadingFlows ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : availableFlows.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-xl">
                      Nenhum fluxo criado. O tracking sera aplicado a todos os fluxos.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mb-2">
                        Deixe vazio para aplicar a todos os fluxos:
                      </p>
                      {availableFlows.map((flow) => (
                        <div
                          key={flow.id}
                          onClick={() => toggleFlow(flow.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedFlows.includes(flow.id)
                              ? "bg-primary/5 border-primary/30"
                              : "bg-muted/30 border-border hover:border-border/80"
                          }`}
                        >
                          <Checkbox 
                            checked={selectedFlows.includes(flow.id)}
                            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary border-border"
                          />
                          <div>
                            <p className="text-sm font-medium text-foreground">{flow.name}</p>
                            <p className="text-xs text-muted-foreground">{flow.status === "ativo" || flow.status === "active" ? "Ativo" : "Inativo"}</p>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
          
          {/* Footer Buttons */}
          <div className="p-6 pt-4 border-t border-border flex flex-col sm:flex-row sm:justify-between gap-3">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting || isSaving}
              className="gap-2"
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FlaskConical className="w-4 h-4" />
              )}
              Testar Conexao
            </Button>
            <div className="flex justify-end gap-3">
              <Button 
                variant="outline" 
                onClick={() => {
                  resetForm()
                  setShowFacebookDialog(false)
                }}
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleCreateProfile}
                disabled={!profileName.trim() || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Perfil"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}
