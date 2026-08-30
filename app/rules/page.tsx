import RuleLibrary from "@/components/RuleLibrary";
import { getAllRules } from "@/lib/rules";

export default function RulesPage() {
  return <RuleLibrary rules={getAllRules()} />;
}
