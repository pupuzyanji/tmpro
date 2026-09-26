import type { Metadata } from 'next';
import { SupportCentre } from './support-centre';

export const metadata: Metadata = {
  title: 'Support — tmPro',
  description: 'tmPro knowledge base, how-to guides and contact details for the support team.',
};

export default function SupportPage() {
  return <SupportCentre />;
}
