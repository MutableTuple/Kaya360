"use client";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import Link from "next/link";
import { useEffect } from "react";

export type Marker = { id: string; lat: number; lng: number; approx: boolean; color: string; title: string; sub: string; href: string; kind: string };

function Focus({ m }: { m?: Marker }) { const map = useMap(); useEffect(() => { if (m) map.setView([m.lat, m.lng], 13); }, [m, map]); return null; }

export default function MapView({ markers, focus }: { markers: Marker[]; focus?: string | null }) {
  return (
    <MapContainer center={[22.5, 79]} zoom={5} scrollWheelZoom className="h-full w-full rounded-xl" style={{ minHeight: 520 }}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {markers.map((m) => (
        <CircleMarker key={m.id} center={[m.lat, m.lng]} radius={m.approx ? 6 : 8} pathOptions={{ color: "#ffffff", weight: 2, fillColor: m.color, fillOpacity: m.approx ? 0.55 : 0.95, dashArray: m.approx ? "3 3" : undefined }}>
          <Popup><div className="text-xs"><div className="font-semibold">{m.title}</div><div>{m.sub}</div>{m.approx && <div className="italic text-slate-500">Approximate — city centre (project not geocoded)</div>}<Link href={m.href} className="text-navy-600 underline">Open {m.kind}</Link></div></Popup>
        </CircleMarker>
      ))}
      <Focus m={markers.find((x) => x.id === focus)} />
    </MapContainer>
  );
}
