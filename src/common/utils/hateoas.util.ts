import { Request } from 'express';

export function generateLinks(request: Request, route: string) {
  const { protocol, headers, originalUrl } = request;
  const host = headers.host;
  const baseUrl = `${protocol}://${host}`;
  const self = `${baseUrl}${originalUrl}`;

  const links: Record<string, string> = {
    self,
  };

  // Standard HATEOAS links based on route
  switch (route) {
    case '/auth/login':
      links.refresh = `${baseUrl}/auth/refresh`;
      links.profile = `${baseUrl}/auth/me`;
      links.logout = `${baseUrl}/auth/logout`;
      break;
    case '/auth/me':
      links.updateProfile = `${baseUrl}/auth/me`;
      links.logout = `${baseUrl}/auth/logout`;
      break;
    case '/schools':
      links.createSchool = `${baseUrl}/schools`;
      links.listSchools = `${baseUrl}/schools`;
      break;
  }

  return links;
}

