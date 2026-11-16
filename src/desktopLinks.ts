import yaml from 'js-yaml';
import desktopYaml from '../configs/desktop-shortcuts.yaml?raw';
import contactsYaml from '../configs/topbar-contacts.yaml?raw';

export type LocalizedLabel = string | { zh: string; en: string };
type Labelled = { label: LocalizedLabel; icon?: string };

export type ContactAction = Labelled & (
  | { type: 'link'; href: string; newTab?: boolean }
  | { type: 'copy'; value: string; success?: LocalizedLabel; failure?: LocalizedLabel }
);
type ContactMenu = Labelled & { id: string; items: ContactAction[]; mobile?: boolean };
type Shortcut = Labelled & { href: string; icon: string; newTab?: boolean };

export function labelPair(label: LocalizedLabel) {
  return typeof label === 'string' ? { zh: label, en: label } : label;
}

export const { shortcuts } = yaml.load(desktopYaml) as { shortcuts: Shortcut[] };
export const { menus } = yaml.load(contactsYaml) as { menus: ContactMenu[] };
