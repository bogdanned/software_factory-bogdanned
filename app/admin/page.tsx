import Link from "next/link";
import { StatusSelect } from "@/components/status-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type FeedbackItem } from "@/lib/api";

export default async function Admin() {
  const { data } = await api<{ items: FeedbackItem[] }>("/api/feedback?limit=100");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Feedback</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead className="w-20 text-right">Votes</TableHead>
            <TableHead className="w-40">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <Link href={`/feedback/${item.id}`} className="hover:underline">
                  {item.title}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">{item.votes}</TableCell>
              <TableCell>
                <StatusSelect id={item.id} status={item.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
