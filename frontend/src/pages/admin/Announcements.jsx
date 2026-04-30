import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { Trash2 } from 'lucide-react';

export default function AdminAnnouncements() {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [level, setLevel] = useState('info');

  const refresh = async () => {
    const { data } = await supabase.from('manishapay_announcements').select('*').order('created_at', { ascending: false });
    setItems(data || []);
  };

  useEffect(() => { refresh(); }, []);

  const create = async () => {
    if (!title || !body) return toast.error('Title and body required');
    const { error } = await supabase.from('manishapay_announcements').insert({ title, body, level });
    if (error) return toast.error(error.message);
    setTitle(''); setBody('');
    toast.success('Published');
    refresh();
  };

  const remove = async (id) => {
    await supabase.from('manishapay_announcements').delete().eq('id', id);
    refresh();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Announcements</h1>
      </header>

      <Card title="New announcement">
        <div className="space-y-3">
          <Input label="Title" value={title} onChange={(e)=>setTitle(e.target.value)}/>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Body</label>
            <textarea rows={4} value={body} onChange={(e)=>setBody(e.target.value)} className="input"/>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Level</label>
              <select className="input" value={level} onChange={(e)=>setLevel(e.target.value)}>
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="critical">critical</option>
              </select>
            </div>
            <Button onClick={create}>Publish</Button>
          </div>
        </div>
      </Card>

      <Card title="Published">
        <ul className="divide-y divide-slate-800">
          {items.map((a) => (
            <li key={a.id} className="flex items-start justify-between py-3">
              <div>
                <p className="font-medium">{a.title}</p>
                <p className="text-sm text-slate-400">{a.body}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(a.created_at)} · {a.level}</p>
              </div>
              <button onClick={()=>remove(a.id)} className="text-rose-400 hover:text-rose-300"><Trash2 size={14}/></button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
