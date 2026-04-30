import HashFixer from '../../components/tools/HashFixer';
import DecimalNormalizer from '../../components/tools/DecimalNormalizer';
import PhoneFormatter from '../../components/tools/PhoneFormatter';
import ButtonGenerator from '../../components/tools/ButtonGenerator';

export default function Tools() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Problem solvers</h1>
        <p className="text-sm text-slate-400">Hand-crafted fixes for the most common PayNow gotchas — backed by the same logic the gateway uses.</p>
      </header>
      <div className="grid gap-6 xl:grid-cols-2">
        <HashFixer />
        <DecimalNormalizer />
        <PhoneFormatter />
        <ButtonGenerator />
      </div>
    </div>
  );
}
