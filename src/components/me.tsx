"use client";
import { createContext, useContext } from "react";
import type { Role } from "@/lib/constants";

export interface Me { id: string; email: string; full_name: string | null; role: Role; designation: string | null; phone: string | null }
export const MeCtx = createContext<{ me: Me | null; settings: Record<string, unknown>; reload: () => void }>({ me: null, settings: {}, reload: () => {} });
export const useMe = () => useContext(MeCtx);
export const canWrite = (me: Me | null) => !!me && ["administrator", "bd_manager", "sales_executive", "researcher"].includes(me.role);
export const isManager = (me: Me | null) => !!me && ["administrator", "bd_manager"].includes(me.role);
export const isAdmin = (me: Me | null) => me?.role === "administrator";
