import { ApiError, apiRequest } from '../api/http';
import type { CompanySettings } from './company-model';

export function getCompany(): Promise<CompanySettings> { return apiRequest('/company'); }
export function saveCompany(settings: unknown, version: number): Promise<CompanySettings> {
  return apiRequest('/company', { method: 'PUT', headers: { 'If-Match': `"${version}"` }, body: JSON.stringify(settings) });
}
async function logoRequest(path: string, init: RequestInit): Promise<{ version?: number; logoHash?: string | null }> {
  const response = await fetch(`/api/v1/company/logo${path}`, { ...init, credentials: 'include', headers: init.headers });
  const body = await response.json().catch(() => null) as { title?: string; version?: number; logoHash?: string | null } | null;
  if (!response.ok) throw new ApiError(body?.title ?? 'Gestion du logo impossible.', response.status);
  return body ?? {};
}
export function uploadCompanyLogo(file: File, version: number): Promise<{ version?: number; logoHash?: string | null }> {
  return logoRequest('', { method: 'PUT', headers: { 'Content-Type': file.type, 'If-Match': `"${version}"` }, body: file });
}
export function deleteCompanyLogo(version: number): Promise<{ version?: number; logoHash?: string | null }> {
  return logoRequest('', { method: 'DELETE', headers: { 'If-Match': `"${version}"` } });
}
