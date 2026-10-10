import { type Member } from "../api";
import ExpenseForm from "./ExpenseForm";

type Props = {
  tripId: string;
  members: Member[];
  onAdded: () => void;
  disabled?: boolean;
};

export default function AddExpenseForm({ tripId, members, onAdded, disabled }: Props) {
  if (disabled) {
    return <p className="hint">Add people to the trip first.</p>;
  }

  return (
    <ExpenseForm tripId={tripId} members={members} onSaved={onAdded} formId="add-expense" />
  );
}
