import React, { useCallback, useEffect, useState } from "react";
import { Archive, Search } from "lucide-react-native";
import { EmptyState, ErrorState, LoadingState } from "@/components/common";
import { SimpleRow, ListScreen } from "@/screens/shared/ScreenKit";
import { goodsDisbursementService } from "@/services/goods-disbursement.service";
import { colors } from "@/theme";
import type { ApiGoodsDisbursement } from "@/types/goodsDisbursement";

export function DisbursedScreen() {
  const [items, setItems] = useState<ApiGoodsDisbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await goodsDisbursementService.list({ limit: 50 });
      setItems(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ListScreen
      title="Disbursed"
      data={loading || error ? [] : items}
      keyExtractor={(item) => item.id}
      empty={
        loading ? (
          <LoadingState label="Loading disbursements" />
        ) : error ? (
          <ErrorState onRetry={() => void load()} />
        ) : (
          <EmptyState icon={<Search size={28} color={colors.textPlaceholder} />} title="No disbursements found" />
        )
      }
      renderItem={({ item }) => (
        <SimpleRow
          title={item.disbursementNumber}
          subtitle={`${item.destination ?? "No destination"} | ${new Date(item.disbursementDate).toLocaleDateString()}`}
          amount={`${item.items.reduce((sum, row) => sum + row.quantity, 0)} items`}
          icon={<Archive size={17} color={colors.primary} />}
        />
      )}
    />
  );
}
