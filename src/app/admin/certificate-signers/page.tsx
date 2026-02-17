import { redirect } from 'next/navigation';

export default function CertificateSignersRedirect() {
  redirect('/admin/certificados');
}
