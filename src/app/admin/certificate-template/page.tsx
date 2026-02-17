import { redirect } from 'next/navigation';

export default function CertificateTemplateRedirect() {
  redirect('/admin/certificados');
}
