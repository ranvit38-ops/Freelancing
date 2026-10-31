/**
 * Who stands behind the Terms and the Privacy statement, and how to reach them.
 *
 * Read at request time, so setting the variables on the host and restarting is
 * enough; nothing needs rebuilding. Unset, the pages say plainly that no
 * operator or contact has been named rather than inventing one, and the pilot
 * check reports it.
 *
 * SETUP REQUIRED: set LABFLOW_LEGAL_NAME (the person or company that runs this
 * site, ideally a company rather than a person), LABFLOW_CONTACT_EMAIL, and
 * LABFLOW_GOVERNING_LAW (a US state, e.g. "Illinois"). Before anyone can upload
 * files, also register a DMCA designated agent with the US Copyright Office
 * (dmca.copyright.gov) and set LABFLOW_COPYRIGHT_AGENT to exactly what was
 * registered: name, postal address and phone. Without that registration the
 * safe harbour for what users upload does not apply.
 */

/** Bump whenever either document changes in substance. */
export const LEGAL_EFFECTIVE = '31 October 2026';

export type LegalIdentity = {
  /** Who "we" are. Falls back to a description when not set. */
  name: string;
  /** Null when no address has been set: say so, never make one up. */
  contact: string | null;
  /** A US state, or null to leave the governing-law clause out. */
  law: string | null;
  /** The registered DMCA agent's name, postal address and phone, or null. */
  copyrightAgent: string | null;
  configured: boolean;
};

export function legalIdentity(): LegalIdentity {
  const name = process.env.LABFLOW_LEGAL_NAME?.trim() || null;
  const raw = process.env.LABFLOW_CONTACT_EMAIL?.trim() ?? '';
  const contact = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null;
  const law = process.env.LABFLOW_GOVERNING_LAW?.trim() || null;
  return {
    name: name ?? 'the operator of this Labquill site',
    contact,
    law,
    copyrightAgent: process.env.LABFLOW_COPYRIGHT_AGENT?.trim() || null,
    configured: Boolean(name && contact),
  };
}
