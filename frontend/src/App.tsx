import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, Bike as BikeIcon, Check,
  ChevronDown, CircleHelp, Clock3, Footprints, Gauge, Leaf, LoaderCircle,
  Plus, RefreshCw, Settings2, ShieldCheck, Sparkles, Trash2, TrendingUp, Wrench,
  X,
} from "lucide-react";
import {
  Bike, BikeRide, ComponentRecord, Dashboard, json, request, Shoe, ShoeAssessment,
  ShoeRun, ShoeStats,
} from "./api";

type Section = "overview" | "bikes" | "shoes";
type Notice = { type: "success" | "error"; message: string } | null;
const today = () => new Date().toISOString().slice(0, 10);
const km = (value: number) => `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function App() {
  const [section, setSection] = useState<Section>("overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const showError = (error: unknown) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Une erreur inattendue est survenue." });

  const refresh = useCallback(async () => {
    try {
      const [dash, bikeList, shoeList] = await Promise.all([
        request<Dashboard>("/dashboard"),
        request<Bike[]>("/bikes"),
        request<Shoe[]>("/shoes"),
      ]);
      setDashboard(dash);
      setBikes(bikeList);
      setShoes(shoeList);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, refreshKey]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const mutate = async (operation: () => Promise<unknown>, message: string) => {
    try {
      await operation();
      setNotice({ type: "success", message });
      setRefreshKey((value) => value + 1);
    } catch (error) { showError(error); }
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setSection("overview")} aria-label="GearTrack accueil">
          <span className="brand-mark"><Activity size={20} strokeWidth={2.5} /></span>
          <span>geartrack<span className="brand-period">.</span></span>
        </a>
        <div className="sidebar-caption">ESPACE PERSONNEL</div>
        <nav className="nav-list" aria-label="Navigation principale">
          <NavButton active={section === "overview"} icon={<Gauge size={18} />} label="Vue d'ensemble" onClick={() => setSection("overview")} />
          <NavButton active={section === "bikes"} icon={<BikeIcon size={18} />} label="Mes vélos" count={bikes.length} onClick={() => setSection("bikes")} />
          <NavButton active={section === "shoes"} icon={<Footprints size={18} />} label="Mes chaussures" count={shoes.length} onClick={() => setSection("shoes")} />
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon"><CircleHelp size={16} /></span>
            <strong>Un doute sur l'indice ?</strong>
            <p>Notre estimation reste un repère, pas une prédiction.</p>
            <button onClick={() => setSection("shoes")}>Comprendre l'usure <ArrowUpRight size={14} /></button>
          </div>
          <div className="profile">
            <div className="avatar">GT</div>
            <div><strong>Mon espace</strong><span>Suivi personnel</span></div>
            <ChevronDown className="profile-chevron" size={15} />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><Activity size={18} /></span> geartrack<span className="brand-period">.</span></div>
          <div className="breadcrumb"><span>Mon activité</span><span className="crumb-divider">/</span><strong>{sectionTitle(section)}</strong></div>
          <div className="top-actions">
            <button className="icon-button" title="Actualiser les données" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw size={16} /></button>
            <span className="live-status"><span /> Données synchronisées</span>
          </div>
        </header>
        <nav className="mobile-nav" aria-label="Navigation principale">
          <NavButton active={section === "overview"} icon={<Gauge size={16} />} label="Accueil" onClick={() => setSection("overview")} />
          <NavButton active={section === "bikes"} icon={<BikeIcon size={16} />} label="Vélos" count={bikes.length} onClick={() => setSection("bikes")} />
          <NavButton active={section === "shoes"} icon={<Footprints size={16} />} label="Chaussures" count={shoes.length} onClick={() => setSection("shoes")} />
        </nav>
        <div className="page-wrap">
          {loading ? <LoadingState /> : section === "overview" ? (
            <Overview dashboard={dashboard} onNavigate={setSection} />
          ) : section === "bikes" ? (
            <BikesPage bikes={bikes} onMutate={mutate} />
          ) : (
            <ShoesPage shoes={shoes} onMutate={mutate} />
          )}
          <footer className="footer"><span>GearTrack · Votre équipement, en mouvement.</span><span>Les données restent les vôtres.</span></footer>
        </div>
      </main>
      {notice && <div className={`toast ${notice.type}`} role="status"><span>{notice.type === "success" ? <Check size={17} /> : <AlertTriangle size={17} />}</span>{notice.message}<button onClick={() => setNotice(null)} aria-label="Fermer"><X size={15} /></button></div>}
    </div>
  );
}

function sectionTitle(section: Section) {
  return section === "overview" ? "Vue d'ensemble" : section === "bikes" ? "Mes vélos" : "Mes chaussures";
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span>{count ? <small>{count}</small> : null}</button>;
}

function LoadingState() {
  return <div className="loading-state"><LoaderCircle className="animate-spin" size={22} /> Chargement de votre espace…</div>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function Overview({ dashboard, onNavigate }: { dashboard: Dashboard | null; onNavigate: (section: Section) => void }) {
  const stats = dashboard ?? {
    bike_count: 0, shoe_count: 0, total_km: 0, bike_km: 0, running_km: 0,
    activity_count: 0, upcoming_maintenance: [], recent_activities: [],
  };
  return (
    <>
      <PageHeading eyebrow="VOTRE GARAGE & VOS SORTIES" title="Bonjour, sportif·ve." subtitle="Un œil sur votre matériel, l'esprit libre sur la route." action={<button className="button secondary" onClick={() => onNavigate("bikes")}><Plus size={16} /> Ajouter du matériel</button>} />
      <section className="hero-panel">
        <div className="hero-copy"><span className="hero-label"><Sparkles size={14} /> VOTRE SAISON, EN UN COUP D'ŒIL</span><h2>Chaque sortie compte.<br /><em>Votre matériel aussi.</em></h2><p>Retrouvez vos kilomètres, vos équipements et les prochains gestes utiles au même endroit.</p></div>
        <div className="hero-visual" aria-hidden="true"><div className="sun"></div><div className="hill hill-back"></div><div className="hill hill-front"></div><div className="hero-path"></div><div className="hero-badge"><span>{stats.activity_count}</span><small>sorties enregistrées</small></div></div>
      </section>
      <div className="stats-grid">
        <StatCard icon={<TrendingUp size={18} />} label="Distance totale" value={km(stats.total_km)} note={`${stats.activity_count} sorties enregistrées`} tint="green" />
        <StatCard icon={<BikeIcon size={18} />} label="Kilomètres à vélo" value={km(stats.bike_km)} note={`${stats.bike_count} ${stats.bike_count > 1 ? "vélos" : "vélo"}`} tint="sand" />
        <StatCard icon={<Footprints size={18} />} label="Kilomètres en course" value={km(stats.running_km)} note={`${stats.shoe_count} ${stats.shoe_count > 1 ? "paires" : "paire"}`} tint="blue" />
        <StatCard icon={<Wrench size={18} />} label="À surveiller" value={`${stats.upcoming_maintenance.filter((item) => item.overdue).length}`} note="entretien(s) en retard" tint="orange" alert />
      </div>
      <div className="dashboard-columns">
        <section className="panel maintenance-panel">
          <PanelTitle icon={<Wrench size={17} />} title="Prochains entretiens" action={<button className="text-link" onClick={() => onNavigate("bikes")}>Tout voir <ArrowUpRight size={14} /></button>} />
          {stats.upcoming_maintenance.length ? <div className="maintenance-list">{stats.upcoming_maintenance.map((item) => {
            const remaining = item.due_at_km - item.current_km;
            return <div className="maintenance-row" key={item.component_id}><span className={`maintenance-icon ${item.overdue ? "danger" : ""}`}>{item.overdue ? <AlertTriangle size={16} /> : <Settings2 size={16} />}</span><div className="maintenance-description"><strong>{item.component}</strong><span>{item.bike} · {item.overdue ? "Échéance dépassée" : `Dans ${km(remaining)}`}</span></div><span className={`due-chip ${item.overdue ? "danger" : ""}`}>{km(item.due_at_km)}</span></div>;
          })}</div> : <EmptyInline icon={<ShieldCheck size={18} />} title="Aucun entretien à planifier" text="Ajoutez un composant avec son intervalle d'entretien pour voir ses échéances ici." onClick={() => onNavigate("bikes")} />}
        </section>
        <section className="panel activity-panel">
          <PanelTitle icon={<Clock3 size={17} />} title="Activité récente" action={<span className="panel-subtle">{stats.activity_count} au total</span>} />
          {stats.recent_activities.length ? <div className="activity-list">{stats.recent_activities.map((item, index) => <div className="activity-row" key={`${item.kind}-${item.date}-${index}`}><span className={`activity-icon ${item.kind === "Vélo" ? "bike" : item.kind === "Course" ? "run" : "service"}`}>{item.kind === "Vélo" ? <BikeIcon size={15} /> : item.kind === "Course" ? <Footprints size={15} /> : <Wrench size={15} />}</span><div className="activity-description"><strong>{item.kind} · {item.label}</strong><span>{dateLabel(item.date)}</span></div><span className="activity-detail">{item.detail}</span></div>)}</div> : <EmptyInline icon={<Activity size={18} />} title="Votre activité apparaîtra ici" text="Enregistrez votre première sortie ou un entretien pour démarrer." onClick={() => onNavigate("bikes")} />}
        </section>
      </div>
      <section className="tip-banner"><div className="tip-icon"><Leaf size={19} /></div><div><strong>Un repère, jamais une vérité absolue.</strong><p>L'indice d'usure des chaussures est une estimation transparente basée sur la distance, le terrain et le dénivelé. Il ne mesure pas votre sécurité ni la durée de vie restante.</p></div><button className="icon-button" title="Voir mes chaussures" onClick={() => onNavigate("shoes")}><ArrowUpRight size={17} /></button></section>
    </>
  );
}

function StatCard({ icon, label, value, note, tint, alert = false }: { icon: React.ReactNode; label: string; value: string; note: string; tint: string; alert?: boolean }) {
  return <div className="stat-card"><div className={`stat-icon ${tint}`}>{icon}</div><div className="stat-label">{label}{alert && <AlertTriangle className="stat-alert" size={13} />}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>;
}

function PanelTitle({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return <div className="panel-title"><div className="panel-title-left"><span className="panel-title-icon">{icon}</span><h2>{title}</h2></div>{action}</div>;
}

function EmptyInline({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return <div className="empty-inline"><span>{icon}</span><strong>{title}</strong><p>{text}</p><button className="text-link" onClick={onClick}>Commencer <ArrowUpRight size={14} /></button></div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}</label>;
}

function TextInput({ name, type = "text", required, placeholder, min, max, step, defaultValue }: { name: string; type?: string; required?: boolean; placeholder?: string; min?: string | number; max?: string | number; step?: string | number; defaultValue?: string | number }) {
  return <input name={name} type={type} required={required} placeholder={placeholder} min={min} max={max} step={step} defaultValue={defaultValue} />;
}

function formData(event: FormEvent<HTMLFormElement>) {
  return Object.fromEntries(
    [...new FormData(event.currentTarget).entries()].map(([key, value]) => [key, value === "" ? null : value]),
  );
}

function BikesPage({ bikes, onMutate }: { bikes: Bike[]; onMutate: (operation: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<number | null>(bikes[0]?.id ?? null);
  const [editing, setEditing] = useState<Bike | null>(null);
  useEffect(() => {
    if (!bikes.some((bike) => bike.id === selectedId)) setSelectedId(bikes[0]?.id ?? null);
  }, [bikes, selectedId]);
  const selected = bikes.find((bike) => bike.id === selectedId) ?? null;

  const saveBike = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = formData(event) as Record<string, string>;
    void onMutate(
      () => request<Bike>(editing ? `/bikes/${editing.id}` : "/bikes", json(editing ? "PATCH" : "POST", data)),
      editing ? "Vélo mis à jour." : "Vélo ajouté.",
    );
    event.currentTarget.reset();
    setEditing(null);
  };

  return <>
    <PageHeading eyebrow="GARAGE" title="Mes vélos" subtitle="Vos montures, leurs composants et leur historique d'entretien." />
    <div className="two-column-layout">
      <section className="panel add-panel">
        <PanelTitle icon={<Plus size={17} />} title={editing ? "Modifier le vélo" : "Ajouter un vélo"} />
        <form className="form-grid" key={`bike-${editing?.id ?? "new"}`} onSubmit={saveBike}>
          <Field label="Nom du vélo"><TextInput name="name" required placeholder="Ex. Mon vélo de route" defaultValue={editing?.name} /></Field>
          <div className="form-row"><Field label="Marque"><TextInput name="brand" placeholder="Ex. Trek" defaultValue={editing?.brand ?? ""} /></Field><Field label="Modèle"><TextInput name="model" placeholder="Ex. Domane" defaultValue={editing?.model ?? ""} /></Field></div>
          <div className="form-row"><Field label="N° de série"><TextInput name="serial_number" defaultValue={editing?.serial_number ?? ""} /></Field><Field label="Date d'achat"><TextInput name="purchase_date" type="date" defaultValue={editing?.purchase_date ?? ""} /></Field></div>
          <Field label="Kilométrage actuel au compteur (km)"><TextInput name="current_odometer_km" type="number" min="0" step="0.1" defaultValue={editing?.current_odometer_km ?? 0} /></Field>
          <div className="form-actions">{editing && <button type="button" className="button secondary" onClick={() => setEditing(null)}>Annuler</button>}<button className="button primary" type="submit">{editing ? <Check size={16} /> : <Plus size={16} />}{editing ? "Enregistrer" : "Ajouter le vélo"}</button></div>
        </form>
        <div className="form-divider" />
        <div className="small-note"><ShieldCheck size={15} /><span>Vos données restent privées et sont enregistrées dans votre base personnelle.</span></div>
      </section>
      <div className="asset-column">
        <section className="panel asset-list-panel">
          <PanelTitle icon={<BikeIcon size={17} />} title="Votre garage" action={<span className="panel-subtle">{bikes.length} vélo{bikes.length > 1 ? "s" : ""}</span>} />
          {bikes.length ? <div className="asset-list">{bikes.map((bike) => <div className={`asset-row ${selectedId === bike.id ? "selected" : ""}`} key={bike.id} onClick={() => setSelectedId(bike.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(bike.id); }}><span className="asset-avatar bike-avatar"><BikeIcon size={18} /></span><span className="asset-info"><strong>{bike.name}</strong><small>{[bike.brand, bike.model].filter(Boolean).join(" · ") || "Vélo"}</small></span><button className="row-icon-button" title="Modifier" onClick={(event) => { event.stopPropagation(); setEditing(bike); }}><Settings2 size={15} /></button><button className="row-icon-button delete" title="Supprimer" onClick={(event) => { event.stopPropagation(); if (window.confirm(`Supprimer « ${bike.name} » et tout son historique ?`)) void onMutate(() => request(`/bikes/${bike.id}`, json("DELETE")), "Vélo et historique supprimés."); }}><Trash2 size={15} /></button></div>)}</div> : <EmptyInline icon={<BikeIcon size={18} />} title="Votre garage est vide" text="Ajoutez votre premier vélo pour commencer le suivi." onClick={() => document.querySelector<HTMLInputElement>('input[name="name"]')?.focus()} />}
        </section>
        {selected && <BikeDetails bike={selected} onMutate={onMutate} />}
      </div>
    </div>
  </>;
}

function BikeDetails({ bike, onMutate }: { bike: Bike; onMutate: (operation: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [components, setComponents] = useState<ComponentRecord[]>([]);
  const [rides, setRides] = useState<BikeRide[]>([]);
  const [error, setError] = useState("");
  const [editingComponent, setEditingComponent] = useState<ComponentRecord | null>(null);
  const load = useCallback(async () => {
    try {
      const [componentList, rideList] = await Promise.all([
        request<ComponentRecord[]>(`/bikes/${bike.id}/components`),
        request<BikeRide[]>(`/bikes/${bike.id}/rides`),
      ]);
      setComponents(componentList);
      setRides(rideList);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erreur de chargement."); }
  }, [bike.id]);
  useEffect(() => { void load(); }, [load]);
  const runMutate = async (operation: () => Promise<unknown>, message: string) => {
    await onMutate(operation, message);
    await load();
  };
  const submit = (event: FormEvent<HTMLFormElement>, path: string, method: string, message: string) => {
    event.preventDefault();
    const data = formData(event);
    void runMutate(() => request(path, json(method, data)), message);
    event.currentTarget.reset();
    if (method === "PATCH") setEditingComponent(null);
  };

  return <section className="panel detail-panel">
    <PanelTitle icon={<Settings2 size={17} />} title={`Détails · ${bike.name}`} />
    {error && <p className="inline-error">{error}</p>}
    <div className="detail-section"><div className="section-label">COMPOSANTS <span>{components.length}</span></div>
      {components.map((component) => <div className="component-row" key={component.id}>
        <div className="component-dot"><Wrench size={14} /></div><div className="component-info"><strong>{component.name}</strong><small>{component.category || "Composant"}{component.maintenance_interval_km ? ` · entretien tous les ${km(component.maintenance_interval_km)}` : ""}</small></div>
        <button className="row-icon-button" title="Modifier le composant" onClick={() => setEditingComponent(component)}><Settings2 size={15} /></button>
        <button className="row-icon-button delete" title="Supprimer le composant" onClick={() => void runMutate(() => request(`/components/${component.id}`, json("DELETE")), "Composant supprimé.")}><Trash2 size={15} /></button>
      </div>)}
      <form className="compact-form" key={`component-${editingComponent?.id ?? "new"}`} onSubmit={(event) => submit(event, editingComponent ? `/components/${editingComponent.id}` : `/bikes/${bike.id}/components`, editingComponent ? "PATCH" : "POST", editingComponent ? "Composant modifié." : "Composant ajouté.")}>
        <div className="form-row"><Field label={editingComponent ? "Composant" : "Nouveau composant"}><TextInput name="name" required placeholder="Ex. Chaîne" defaultValue={editingComponent?.name} /></Field><Field label="Catégorie"><TextInput name="category" placeholder="Transmission" defaultValue={editingComponent?.category ?? ""} /></Field></div>
        <div className="form-row"><Field label="Kilométrage à l'installation"><TextInput name="installed_km" type="number" min="0" defaultValue={editingComponent?.installed_km ?? 0} /></Field><Field label="Intervalle d'entretien (km)"><TextInput name="maintenance_interval_km" type="number" min="1" defaultValue={editingComponent?.maintenance_interval_km ?? ""} /></Field></div>
        <div className="form-actions">{editingComponent && <button type="button" className="button secondary" onClick={() => setEditingComponent(null)}>Annuler</button>}<button className="button secondary compact-button" type="submit"><Plus size={14} />{editingComponent ? "Enregistrer" : "Ajouter le composant"}</button></div>
      </form>
    </div>
    <div className="detail-section"><div className="section-label">ENREGISTRER UNE SORTIE</div>
      <form className="form-grid compact-form" onSubmit={(event) => submit(event, `/bikes/${bike.id}/rides`, "POST", "Sortie vélo enregistrée.")}>
        <div className="form-row"><Field label="Date"><TextInput name="occurred_on" type="date" required defaultValue={today()} /></Field><Field label="Distance (km)"><TextInput name="distance_km" type="number" min="0.1" step="0.1" required placeholder="45" /></Field><Field label="Durée (min)"><TextInput name="duration_minutes" type="number" min="1" required placeholder="120" /></Field></div>
        <div className="form-row"><Field label="Dénivelé (m)"><TextInput name="elevation_m" type="number" min="0" defaultValue="0" /></Field><Field label="Type de sortie"><select name="ride_type" defaultValue="route"><option value="route">Route</option><option value="trail">VTT / chemin</option><option value="commute">Déplacement</option><option value="indoor">Home trainer</option></select></Field></div>
        <button className="button secondary compact-button" type="submit"><Plus size={14} />Enregistrer la sortie</button>
      </form>
      <div className="history-list">{rides.slice(0, 4).map((ride) => <div className="history-row" key={ride.id}><span>{dateLabel(ride.occurred_on)}</span><strong>{km(ride.distance_km)}</strong><small>{ride.duration_minutes} min · {ride.elevation_m} m D+</small></div>)}</div>
    </div>
    <div className="detail-section"><div className="section-label">JOURNAL DE MAINTENANCE</div>
      <form className="form-grid compact-form" onSubmit={(event) => submit(event, "/maintenance", "POST", "Entretien enregistré.")}>
        <Field label="Opération"><TextInput name="operation" required placeholder="Ex. Réglage des freins" /></Field>
        <div className="form-row"><Field label="Composant"><select name="component_id" defaultValue=""><option value="">Vélo complet</option>{components.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Date"><TextInput name="performed_on" type="date" required defaultValue={today()} /></Field></div>
        <div className="form-row"><Field label="Kilométrage vélo"><TextInput name="bike_km" type="number" min="0" step="0.1" required placeholder="1250" /></Field><Field label="Coût (€)"><TextInput name="cost_eur" type="number" min="0" step="0.01" placeholder="0" /></Field></div>
        <input type="hidden" name="bike_id" value={bike.id} /><button className="button secondary compact-button" type="submit"><Plus size={14} />Enregistrer l'entretien</button>
      </form>
    </div>
  </section>;
}

function ShoesPage({ shoes, onMutate }: { shoes: Shoe[]; onMutate: (operation: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<number | null>(shoes[0]?.id ?? null);
  const [editing, setEditing] = useState<Shoe | null>(null);
  useEffect(() => {
    if (!shoes.some((shoe) => shoe.id === selectedId)) setSelectedId(shoes[0]?.id ?? null);
  }, [shoes, selectedId]);
  const selected = shoes.find((shoe) => shoe.id === selectedId) ?? null;
  const saveShoe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = formData(event);
    void onMutate(
      () => request<Shoe>(editing ? `/shoes/${editing.id}` : "/shoes", json(editing ? "PATCH" : "POST", data)),
      editing ? "Paire mise à jour." : "Paire ajoutée.",
    );
    event.currentTarget.reset();
    setEditing(null);
  };
  return <>
    <PageHeading eyebrow="COURSE & TRAIL" title="Mes chaussures" subtitle="Le kilométrage réel et un indicateur d'usure clair, sans promesse de durée de vie." />
    <div className="two-column-layout">
      <section className="panel add-panel">
        <PanelTitle icon={<Plus size={17} />} title={editing ? "Modifier la paire" : "Ajouter une paire"} />
        <form className="form-grid" key={`shoe-${editing?.id ?? "new"}`} onSubmit={saveShoe}>
          <Field label="Nom de la paire"><TextInput name="name" required placeholder="Ex. Trail montagne" defaultValue={editing?.name} /></Field>
          <div className="form-row"><Field label="Marque"><TextInput name="brand" placeholder="Ex. Salomon" defaultValue={editing?.brand ?? ""} /></Field><Field label="Modèle"><TextInput name="model" placeholder="Ex. Sense Ride" defaultValue={editing?.model ?? ""} /></Field></div>
          <div className="form-row"><Field label="Usage"><select name="shoe_type" defaultValue={editing?.shoe_type ?? "running"}><option value="running">Route</option><option value="trail">Trail</option><option value="mixed">Mixte</option></select></Field><Field label="Date d'achat"><TextInput name="purchase_date" type="date" defaultValue={editing?.purchase_date ?? ""} /></Field></div>
          <div className="form-actions">{editing && <button type="button" className="button secondary" onClick={() => setEditing(null)}>Annuler</button>}<button className="button primary" type="submit">{editing ? <Check size={16} /> : <Plus size={16} />}{editing ? "Enregistrer" : "Ajouter la paire"}</button></div>
        </form>
        <div className="form-divider" /><div className="small-note"><Gauge size={15} /><span>Pas de seuil de remplacement automatique : seul votre ressenti décide.</span></div>
      </section>
      <div className="asset-column">
        <section className="panel asset-list-panel">
          <PanelTitle icon={<Footprints size={17} />} title="Mes paires" action={<span className="panel-subtle">{shoes.length} paire{shoes.length > 1 ? "s" : ""}</span>} />
          {shoes.length ? <div className="asset-list">{shoes.map((shoe) => <div className={`asset-row ${selectedId === shoe.id ? "selected" : ""}`} key={shoe.id} onClick={() => setSelectedId(shoe.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(shoe.id); }}><span className="asset-avatar shoe-avatar"><Footprints size={18} /></span><span className="asset-info"><strong>{shoe.name}</strong><small>{[shoe.brand, shoe.model].filter(Boolean).join(" · ") || shoe.shoe_type}</small></span><button className="row-icon-button" title="Modifier" onClick={(event) => { event.stopPropagation(); setEditing(shoe); }}><Settings2 size={15} /></button><button className="row-icon-button delete" title="Supprimer" onClick={(event) => { event.stopPropagation(); if (window.confirm(`Supprimer « ${shoe.name} » et tout son historique ?`)) void onMutate(() => request(`/shoes/${shoe.id}`, json("DELETE")), "Paire et historique supprimés."); }}><Trash2 size={15} /></button></div>)}</div> : <EmptyInline icon={<Footprints size={18} />} title="Aucune paire enregistrée" text="Ajoutez une paire pour suivre ses sorties et son état." onClick={() => document.querySelector<HTMLInputElement>('input[name="name"]')?.focus()} />}
        </section>
        {selected && <ShoeDetails shoe={selected} onMutate={onMutate} />}
      </div>
    </div>
  </>;
}

function ShoeDetails({ shoe, onMutate }: { shoe: Shoe; onMutate: (operation: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [stats, setStats] = useState<ShoeStats | null>(null);
  const [runs, setRuns] = useState<ShoeRun[]>([]);
  const [assessments, setAssessments] = useState<ShoeAssessment[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [shoeStats, runList, assessmentList] = await Promise.all([
        request<ShoeStats>(`/shoes/${shoe.id}/stats`),
        request<ShoeRun[]>(`/shoes/${shoe.id}/runs`),
        request<ShoeAssessment[]>(`/shoes/${shoe.id}/assessments`),
      ]);
      setStats(shoeStats);
      setRuns(runList);
      setAssessments(assessmentList);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erreur de chargement."); }
  }, [shoe.id]);
  useEffect(() => { void load(); }, [load]);
  const runMutate = async (operation: () => Promise<unknown>, message: string) => {
    await onMutate(operation, message);
    await load();
  };
  const submit = (event: FormEvent<HTMLFormElement>, path: string, message: string) => {
    event.preventDefault();
    const data = formData(event);
    void runMutate(() => request(path, json("POST", data)), message);
    event.currentTarget.reset();
  };
  const scoreFields = [
    ["sole_score", "Semelle"], ["grip_score", "Accroche"], ["cushion_score", "Amorti"], ["comfort_score", "Confort"],
  ];
  return <section className="panel detail-panel">
    <PanelTitle icon={<Gauge size={17} />} title={`Analyse · ${shoe.name}`} />
    {error && <p className="inline-error">{error}</p>}
    {stats && <div className="shoe-metrics">
      <div className="shoe-km-metric"><span>KILOMÉTRAGE RÉEL</span><strong>{km(stats.actual_km)}</strong><small>{stats.run_count} sortie{stats.run_count > 1 ? "s" : ""}</small></div>
      <div className="shoe-km-metric estimate"><span>INDICE D'USURE ESTIMÉ</span><strong>{km(stats.estimated_wear_km)}</strong><small>équivalent heuristique</small></div>
    </div>}
    {stats && <div className="stats-details">
      <div className="surface-bar"><span style={{ width: `${stats.road_percent}%` }} /><span style={{ width: `${stats.trail_percent}%` }} /></div>
      <div className="surface-legend"><span><i className="road-dot" />Route {stats.road_percent.toFixed(0)}%</span><span><i className="trail-dot" />Trail {stats.trail_percent.toFixed(0)}%</span></div>
      <div className="small-stats"><span><Clock3 size={14} />{Math.round(stats.average_duration_minutes)} min / sortie</span><span><TrendingUp size={14} />{stats.total_elevation_m.toLocaleString("fr-FR")} m D+</span></div>
    </div>}
    <div className="wear-explanation"><span><Leaf size={15} /></span><p>Indice = distance × facteur terrain × facteur dénivelé. Valeurs actuelles : trail ×{stats?.wear_factors.trail_factor.toFixed(2) ?? "1,25"} ; +{((stats?.wear_factors.elevation_factor_per_100m_per_km ?? 0.03) * 100).toFixed(0)}% par 100 m D+ / km. La durée et les pas ne multiplient pas l'exposition.</p></div>
    <div className="detail-section"><div className="section-label">ENREGISTRER UNE SORTIE</div>
      <form className="form-grid compact-form" onSubmit={(event) => submit(event, `/shoes/${shoe.id}/runs`, "Sortie running enregistrée.")}>
        <div className="form-row"><Field label="Date"><TextInput name="occurred_on" type="date" required defaultValue={today()} /></Field><Field label="Distance totale (km)"><TextInput name="distance_km" type="number" min="0.1" step="0.1" required placeholder="8" /></Field></div>
        <div className="form-row"><Field label="Route (km)"><TextInput name="road_km" type="number" min="0" step="0.1" required placeholder="5" /></Field><Field label="Trail (km)"><TextInput name="trail_km" type="number" min="0" step="0.1" required placeholder="3" /></Field></div>
        <div className="form-row"><Field label="Durée (min)"><TextInput name="duration_minutes" type="number" min="1" required placeholder="50" /></Field><Field label="Dénivelé (m)"><TextInput name="elevation_m" type="number" min="0" defaultValue="0" /></Field><Field label="Pas (facultatif)"><TextInput name="steps" type="number" min="1" placeholder="Optionnel" /></Field></div>
        <div className="field-hint">La somme route + trail doit égaler la distance totale.</div>
        <button className="button secondary compact-button" type="submit"><Plus size={14} />Enregistrer la sortie</button>
      </form>
      <div className="history-list">{runs.slice(0, 4).map((run) => <div className="history-row" key={run.id}><span>{dateLabel(run.occurred_on)}</span><strong>{km(run.distance_km)}</strong><small>{run.duration_minutes} min · {run.elevation_m} m D+</small></div>)}</div>
    </div>
    <div className="detail-section"><div className="section-label">ÉVALUATION PHYSIQUE <span>1 = usé · 5 = excellent</span></div>
      <form className="form-grid compact-form" onSubmit={(event) => submit(event, `/shoes/${shoe.id}/assessments`, "Évaluation enregistrée.")}>
        <Field label="Date"><TextInput name="assessed_on" type="date" required defaultValue={today()} /></Field>
        <div className="score-grid">{scoreFields.map(([name, label]) => <Field key={name} label={label}><select name={name} defaultValue="4"><option value="1">1 · Très usé</option><option value="2">2 · Usé</option><option value="3">3 · Moyen</option><option value="4">4 · Bon</option><option value="5">5 · Excellent</option></select></Field>)}</div>
        <button className="button secondary compact-button" type="submit"><Plus size={14} />Enregistrer l'évaluation</button>
      </form>
      <div className="assessment-list">{assessments.slice(0, 3).map((item) => <div className="assessment-row" key={item.id}><span>{dateLabel(item.assessed_on)}</span><span>Semelle {item.sole_score}/5 · Accroche {item.grip_score}/5 · Amorti {item.cushion_score}/5 · Confort {item.comfort_score}/5</span></div>)}</div>
    </div>
  </section>;
}

export default App;
