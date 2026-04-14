const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const resolveEmployeeServiceWebUrl = () => {
	const configuredWebUrl = String(import.meta.env.VITE_EMPLOYEE_SERVICE_WEB_URL || '').trim()
	if (configuredWebUrl) {
		return trimTrailingSlash(configuredWebUrl)
	}

	return `${window.location.protocol}//${window.location.hostname}:5000`
}

const resolveEmployeeServiceApiUrl = (webUrl: string) => {
	const configuredApiUrl = String(import.meta.env.VITE_EMPLOYEE_SERVICE_API_URL || '').trim()
	if (configuredApiUrl) {
		return trimTrailingSlash(configuredApiUrl)
	}

	return `${webUrl}/api/v1`
}

export const BASE_URL = `${window.location.origin}/api/v1`
export const BASE_IMAGE_URL = `${window.location.origin}`
export const EMPLOYEE_SERVICE_WEB_URL = resolveEmployeeServiceWebUrl()
export const EMPLOYEE_SERVICE_URL = resolveEmployeeServiceApiUrl(EMPLOYEE_SERVICE_WEB_URL)
//  export const BASE_URL = "http://127.0.0.1:8005/api/v1"
//  export const BASE_IMAGE_URL = "http://127.0.0.1:8005"
//export const BASE_URL = "https://inv.bnpz.uz/api/v1"
//export const BASE_IMAGE_URL = "https://inv.bnpz.uz"


