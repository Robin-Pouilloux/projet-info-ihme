export type Bike = {
  id: number;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  current_odometer_km: number;
};

export type ComponentRecord = {
  id: number;
  bike_id: number;
  name: string;
  category: string | null;
  installed_km: number;
  maintenance_interval_km: number | null;
};

export type BikeRide = {
  id: number;
  bike_id: number;
  occurred_on: string;
  distance_km: number;
  duration_minutes: number;
  elevation_m: number;
  ride_type: string;
};

export type Shoe = {
  id: number;
  name: string;
  brand: string | null;
  model: string | null;
  shoe_type: string;
  purchase_date: string | null;
  notes: string | null;
};

export type ShoeRun = {
  id: number;
  shoe_id: number;
  occurred_on: string;
  distance_km: number;
  duration_minutes: number;
  elevation_m: number;
  steps: number | null;
  road_km: number;
  trail_km: number;
};

export type ShoeAssessment = {
  id: number;
  shoe_id: number;
  assessed_on: string;
  sole_score: number;
  grip_score: number;
  cushion_score: number;
  comfort_score: number;
  notes: string | null;
};

export type ShoeStats = {
  shoe_id: number;
  actual_km: number;
  estimated_wear_km: number;
  run_count: number;
  average_duration_minutes: number;
  total_elevation_m: number;
  road_percent: number;
  trail_percent: number;
  wear_factors: Record<string, number>;
};

export type Dashboard = {
  bike_count: number;
  shoe_count: number;
  total_km: number;
  bike_km: number;
  running_km: number;
  activity_count: number;
  upcoming_maintenance: {
    component_id: number;
    component: string;
    bike_id: number;
    bike: string;
    due_at_km: number;
    current_km: number;
    overdue: boolean;
  }[];
  recent_activities: { date: string; kind: string; label: string; detail: string }[];
};

const fieldLabels: Record<string, string> = {
  name: "Nom",
  brand: "Marque",
  model: "Modèle",
  purchase_date: "Date d'achat",
  current_odometer_km: "Kilométrage actuel",
  maintenance_interval_km: "Intervalle d'entretien",
  occurred_on: "Date de sortie",
  performed_on: "Date d'entretien",
  assessed_on: "Date d'évaluation",
  distance_km: "Distance",
  duration_minutes: "Durée",
  elevation_m: "Dénivelé",
  road_km: "Distance route",
  trail_km: "Distance trail",
  steps: "Pas",
  bike_km: "Kilométrage vélo",
  cost_eur: "Coût",
  operation: "Opération",
};

function validationMessage(item: { loc?: (string | number)[]; msg?: string; type?: string; ctx?: Record<string, unknown> }) {
  const field = item.loc?.length ? String(item.loc[item.loc.length - 1]) : "";
  const label = fieldLabels[field] ?? (field && field !== "body" ? field : "");
  let reason = item.msg?.replace(/^Value error,\s*/, "") ?? "est invalide.";
  switch (item.type) {
    case "missing": reason = "est obligatoire."; break;
    case "greater_than": reason = `doit être supérieur à ${String(item.ctx?.gt)}.`; break;
    case "greater_than_equal": reason = `doit être au moins égal à ${String(item.ctx?.ge)}.`; break;
    case "less_than": reason = `doit être inférieur à ${String(item.ctx?.lt)}.`; break;
    case "less_than_equal": reason = `doit être au plus égal à ${String(item.ctx?.le)}.`; break;
    case "int_parsing":
    case "float_parsing":
    case "decimal_parsing": reason = "doit contenir un nombre valide."; break;
    case "string_too_short": reason = "est trop court."; break;
    case "string_too_long": reason = "est trop long."; break;
  }
  return label ? `${label} : ${reason}` : reason;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const message = Array.isArray(detail)
      ? detail.map(validationMessage).filter(Boolean).join(" ")
      : typeof detail === "string"
        ? detail
        : `Erreur du serveur (${response.status}).`;
    throw new Error(message || `Erreur du serveur (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const json = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});
