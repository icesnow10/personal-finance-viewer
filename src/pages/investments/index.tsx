import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card, Typography, Button, Table, Space, Form, Input, Select,
  DatePicker, Modal, message, Popconfirm, Statistic, Row, Col,
  Segmented, Radio, Collapse, Tag, Checkbox,
} from "antd";
import dayjs from "dayjs";
import {
  PiggyBank, Plus, Edit, Trash2, FilterX, Table as TableIcon,
  Network, DollarSign, Save, FolderOpen, Copy, ArrowUp, ArrowDown,
  ChevronDown, ChevronUp, Star, Minus, BarChart3, LayoutDashboard,
  Users, Building2, FileSpreadsheet, Settings, Eye, EyeOff, RefreshCw,
} from "lucide-react";
import { useRedact } from "@/context/RedactContext";
import { useInvestments } from "@/hooks/useInvestments";
import type {
  Investment, FilteredInfo, ComparisonRow, DetailedComparisonRow,
} from "@/lib/investment-types";
import {
  brokerOptions, productOptions, productOrder, isUSInvestment, formatBRL,
} from "@/lib/investment-types";
import { MonthSelector } from "@/components/shared/MonthSelector";
import { MarkdownView } from "@/components/shared/MarkdownView";

const { Title } = Typography;

export default function InvestmentsPage() {
  const { investments, setInvestments } = useInvestments();
  const { redacted, toggle: toggleRedact } = useRedact();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [invRes, repRes] = await Promise.all([
        fetch("/api/investments"),
        fetch("/api/reports"),
      ]);
      const invData = await invRes.json();
      const repData = await repRes.json();
      if (Array.isArray(invData)) {
        setInvestments(invData.map((r: Investment, i: number) => ({
          ...r,
          key: r.key ?? `${r.month_year}-${r.broker}-${r.holder}-${r.nome}-${i}`,
        })));
      }
      if (Array.isArray(repData)) {
        setReports(repData);
        if (repData.length && !repData.some((r) => `${r.month}__${r.filename}` === selectedReport)) {
          setSelectedReport(`${repData[0].month}__${repData[0].filename}`);
        }
      }
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null);
  const [form] = Form.useForm();
  const [selectedProduct, setSelectedProduct] = useState("");
  const [calculatedValue, setCalculatedValue] = useState(0);
  const [filteredInfo, setFilteredInfo] = useState<FilteredInfo>({});
  const [viewMode, setViewMode] = useState<"table" | "tree" | "comparison" | "summary" | "reports">("summary");
  const [summaryView, setSummaryView] = useState<"broker" | "product" | "holder">("broker");
  const [reports, setReports] = useState<Array<{ month: string; filename: string; title: string; content: string }>>([]);
  const [selectedReport, setSelectedReport] = useState<string>("");
  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setReports(data);
          if (data.length && !selectedReport) setSelectedReport(`${data[0].month}__${data[0].filename}`);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isUpdateValueModalOpen, setIsUpdateValueModalOpen] = useState(false);
  const [updatingInvestment, setUpdatingInvestment] = useState<Investment | null>(null);
  const [updateValueForm] = Form.useForm();
  const [calculatedValueUpdate, setCalculatedValueUpdate] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().subtract(1, "month").format("YYYY-MM"));
  const [selectedHolder, setSelectedHolder] = useState("all");
  const [selectedBroker, setSelectedBroker] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [isCopyMonthModalOpen, setIsCopyMonthModalOpen] = useState(false);
  const [copyMonthForm] = Form.useForm();
  const [isDeleteMonthModalOpen, setIsDeleteMonthModalOpen] = useState(false);
  const [deleteMonthForm] = Form.useForm();
  const [activeCollapseKeys, setActiveCollapseKeys] = useState<string[]>(productOrder);
  const [comparisonMonths, setComparisonMonths] = useState<string[]>([]);
  const [showSubtotals, setShowSubtotals] = useState(true);
  const [showBloqueado, setShowBloqueado] = useState(true);
  const [mergeTypeColumn, setMergeTypeColumn] = useState(true);
  const [decimalSeparator, setDecimalSeparator] = useState<"comma" | "dot">("comma");
  const [comparisonDetailMode, setComparisonDetailMode] = useState<"summary" | "detailed">("summary");
  const [detailedExpandedKeys, setDetailedExpandedKeys] = useState<string[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [exportMonth, setExportMonth] = useState("all");
  const [isImportChoiceModalOpen, setIsImportChoiceModalOpen] = useState(false);
  const [isReplaceConfirmModalOpen, setIsReplaceConfirmModalOpen] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<Investment[]>([]);

  const uniqueMonthsForFilter = useMemo(
    () => Array.from(new Set(investments.map((inv) => inv.month_year))).sort().reverse(),
    [investments]
  );
  const uniqueBrokersForFilter = useMemo(
    () => Array.from(new Set(investments.map((inv) => inv.broker))).sort(),
    [investments]
  );
  const uniqueMonths = useMemo(
    () => Array.from(new Set(investments.map((inv) => inv.month_year))).sort(),
    [investments]
  );
  const uniqueBrokers = useMemo(
    () => Array.from(new Set(investments.map((inv) => inv.broker))).sort(),
    [investments]
  );
  const uniqueNomes = useMemo(
    () => Array.from(new Set(investments.map((inv) => inv.nome))).sort(),
    [investments]
  );

  // Default comparison to the latest 2 months once investments load
  useEffect(() => {
    if (comparisonMonths.length === 0 && uniqueMonthsForFilter.length >= 2) {
      setComparisonMonths([uniqueMonthsForFilter[1], uniqueMonthsForFilter[0]]);
    } else if (comparisonMonths.length === 0 && uniqueMonthsForFilter.length === 1) {
      setComparisonMonths([uniqueMonthsForFilter[0]]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueMonthsForFilter]);

  // Auto-expand detailed comparison rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getDetailedComparisonData = useCallback((): DetailedComparisonRow[] => {
    if (comparisonMonths.length === 0) return [];

    const relevantInvestments = investments.filter((inv) =>
      comparisonMonths.includes(inv.month_year)
    );

    const lookup = new Map<string, Map<string, Map<string, Map<string, { value: number; qty: number }>>>>();
    relevantInvestments.forEach((inv) => {
      const type = inv.type || "available";
      let typeMap = lookup.get(type);
      if (!typeMap) { typeMap = new Map(); lookup.set(type, typeMap); }
      let productMap = typeMap.get(inv.product);
      if (!productMap) { productMap = new Map(); typeMap.set(inv.product, productMap); }
      let nomeMap = productMap.get(inv.nome);
      if (!nomeMap) { nomeMap = new Map(); productMap.set(inv.nome, nomeMap); }
      const existing = nomeMap.get(inv.month_year) || { value: 0, qty: 0 };
      nomeMap.set(inv.month_year, { value: existing.value + inv.valor_atual, qty: existing.qty + inv.quantidade });
    });

    const data: DetailedComparisonRow[] = [];
    const types = ["available", "frozen"] as const;

    types.forEach((type) => {
      const typeLabel = type === "available" ? "Disponível" : "Bloqueado";
      const typeSubtotal: DetailedComparisonRow = { key: `subtotal_${type}`, product: `SUBTOTAL ${typeLabel.toUpperCase()}`, nome: "", isSubtotal: true };
      const typeMap = lookup.get(type);
      if (!typeMap) return;

      const productsWithData = Array.from(typeMap.keys()).sort(
        (a, b) => (productOrder.indexOf(a) === -1 ? 999 : productOrder.indexOf(a)) - (productOrder.indexOf(b) === -1 ? 999 : productOrder.indexOf(b))
      );

      productsWithData.forEach((product) => {
        const productMapForProduct = typeMap.get(product);
        if (!productMapForProduct) return;
        const productRow: DetailedComparisonRow = { key: `${type}_${product}`, product, nome: "", isProductRow: true };
        const children: DetailedComparisonRow[] = [];

        Array.from(productMapForProduct.keys()).sort().forEach((nome) => {
          const nomeMap = productMapForProduct.get(nome);
          if (!nomeMap) return;
          const childRow: DetailedComparisonRow = { key: `${type}_${product}_${nome}`, product: "", nome };
          comparisonMonths.forEach((month) => {
            const entry = nomeMap.get(month);
            childRow[month] = entry?.value ?? 0;
            childRow[`qty_${month}`] = entry?.qty ?? 0;
          });
          if (comparisonMonths.some((month) => Number(childRow[month]) > 0)) children.push(childRow);
        });

        comparisonMonths.forEach((month) => {
          productRow[month] = children.reduce((sum: number, c) => sum + (Number(c[month]) || 0), 0);
          typeSubtotal[month] = (Number(typeSubtotal[month]) || 0) + (Number(productRow[month]) || 0);
        });

        if (children.length > 0) { productRow.children = children; data.push(productRow); }
      });

      if (comparisonMonths.some((month) => Number(typeSubtotal[month]) > 0)) data.push(typeSubtotal);
    });

    const totalRow: DetailedComparisonRow = { key: "total", product: "TOTAL GERAL", nome: "", isTotal: true };
    comparisonMonths.forEach((month) => {
      totalRow[month] = relevantInvestments.filter((inv) => inv.month_year === month).reduce((sum, inv) => sum + inv.valor_atual, 0);
    });
    data.push(totalRow);
    return data;
  }, [investments, comparisonMonths]);

  useEffect(() => {
    if (comparisonDetailMode === "detailed" && comparisonMonths.length > 0) {
      const allKeys = getDetailedComparisonData()
        .filter((r) => r.children && r.children.length > 0)
        .map((r) => r.key);
      setDetailedExpandedKeys(allKeys);
    }
  }, [comparisonDetailMode, comparisonMonths, getDetailedComparisonData]);

  // ── Export / Import ──

  const openExportModal = (format: "json" | "csv") => {
    setExportFormat(format);
    setExportMonth("all");
    setIsExportModalOpen(true);
  };

  const getExportInvestments = () => exportMonth === "all" ? investments : investments.filter((inv) => inv.month_year === exportMonth);

  const formatNumberForCSV = (value: number | undefined | null) => {
    if (value === undefined || value === null) return "";
    return decimalSeparator === "comma" ? value.toString().replace(".", ",") : value.toString();
  };

  const exportJSON = useCallback((data: Investment[]) => {
    const exportData = data.map((inv) => ({
      key: inv.key, month_year: inv.month_year, broker: inv.broker, holder: inv.holder,
      type: inv.type, product: inv.product, nome: inv.nome, quantidade: inv.quantidade,
      quantidade_usd: inv.quantidade_usd || null, taxa_usd_brl: inv.taxa_usd_brl || null,
      valor_atual: inv.valor_atual, updated_at: inv.updated_at,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = dayjs().format("YYYY-MM-DD_HHmmss");
    const monthSuffix = exportMonth === "all" ? "" : `_${exportMonth}`;
    a.href = url;
    a.download = `personal_finances${monthSuffix}_${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`Exported ${data.length} investments as JSON!`);
  }, [exportMonth]);

  const exportCSV = useCallback((data: Investment[]) => {
    const separator = decimalSeparator === "comma" ? ";" : ",";
    const headers = ["month_year", "broker", "holder", "type", "product", "nome", "quantidade", "quantidade_usd", "taxa_usd_brl", "valor_atual", "updated_at"];
    const csvContent = [
      headers.join(separator),
      ...data.map((inv) => [
        inv.month_year, inv.broker, inv.holder, inv.type, `"${inv.product}"`, `"${inv.nome}"`,
        formatNumberForCSV(inv.quantidade), formatNumberForCSV(inv.quantidade_usd),
        formatNumberForCSV(inv.taxa_usd_brl), formatNumberForCSV(inv.valor_atual), inv.updated_at,
      ].join(separator)),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = dayjs().format("YYYY-MM-DD_HHmmss");
    const monthSuffix = exportMonth === "all" ? "" : `_${exportMonth}`;
    a.href = url;
    a.download = `personal_finances${monthSuffix}_${timestamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`Exported ${data.length} investments as CSV!`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decimalSeparator, exportMonth]);

  const handleExport = () => {
    const data = getExportInvestments();
    if (data.length === 0) { message.warning("No data to export for the selected month!"); return; }
    if (exportFormat === "json") exportJSON(data); else exportCSV(data);
    setIsExportModalOpen(false);
  };

  const importFromLocalFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          if (Array.isArray(data)) { setPendingImportData(data); setIsImportChoiceModalOpen(true); }
          else message.error("Invalid JSON format. Expected an array of investments.");
        } catch { message.error("Failed to parse JSON file."); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleImportAppend = () => {
    const identity = (inv: Investment) => `${inv.month_year}|${inv.broker}|${inv.holder}|${inv.product}|${inv.nome}`;
    const existing = new Set(investments.map(identity));
    const newItems = pendingImportData.filter((item) => !existing.has(identity(item)));
    const dupes = pendingImportData.length - newItems.length;
    const reassigned = newItems.map((item) => ({ ...item, key: `${Date.now()}_${Math.random()}` }));
    setInvestments((prev) => [...prev, ...reassigned]);
    setIsImportChoiceModalOpen(false);
    setPendingImportData([]);
    message.success(dupes > 0 ? `Appended ${newItems.length} investments (${dupes} duplicates skipped).` : `Appended ${newItems.length} investments!`);
  };

  const handleImportReplaceRequest = () => { setIsImportChoiceModalOpen(false); setIsReplaceConfirmModalOpen(true); };
  const handleImportReplaceConfirm = () => {
    setInvestments(pendingImportData);
    setIsReplaceConfirmModalOpen(false);
    setPendingImportData([]);
    message.success(`Replaced all data with ${pendingImportData.length} investments!`);
  };
  const handleImportCancel = () => { setIsImportChoiceModalOpen(false); setIsReplaceConfirmModalOpen(false); setPendingImportData([]); };

  // ── Copy / Delete Month ──

  const getLatestMonthsOptions = () => {
    const months = [];
    for (let i = 0; i < 5; i++) {
      const month = dayjs().subtract(i, "month").format("YYYY-MM");
      months.push({ value: month, label: dayjs(month, "YYYY-MM").format("MMM YYYY") });
    }
    return months;
  };

  const showCopyMonthModal = () => {
    copyMonthForm.setFieldsValue({ source_month: dayjs().subtract(1, "month").format("YYYY-MM"), target_month: dayjs().format("YYYY-MM") });
    setIsCopyMonthModalOpen(true);
  };

  const handleCopyMonth = () => {
    copyMonthForm.validateFields().then((values) => {
      const source = investments.filter((inv) => inv.month_year === values.source_month);
      if (source.length === 0) { message.warning(`No investments found for ${values.source_month}`); return; }
      if (investments.some((inv) => inv.month_year === values.target_month)) { message.warning(`Target month ${values.target_month} already has data.`); return; }
      const now = new Date().toISOString();
      const copies: Investment[] = source.map((inv) => ({ ...inv, key: `${Date.now()}_${Math.random()}`, month_year: values.target_month, quantidade: 0, valor_atual: 0, updated_at: now }));
      setInvestments((prev) => [...prev, ...copies]);
      message.success(`Copied ${copies.length} investments from ${values.source_month} to ${values.target_month} with zeroed values!`);
      setIsCopyMonthModalOpen(false);
      copyMonthForm.resetFields();
    });
  };

  const showDeleteMonthModal = () => {
    deleteMonthForm.setFieldsValue({ delete_month: dayjs().subtract(1, "month").format("YYYY-MM") });
    setIsDeleteMonthModalOpen(true);
  };

  const handleDeleteMonth = () => {
    deleteMonthForm.validateFields().then((values) => {
      const toDelete = investments.filter((inv) => inv.month_year === values.delete_month);
      if (toDelete.length === 0) { message.warning(`No investments found for ${values.delete_month}`); return; }
      Modal.confirm({
        title: "Confirm Deletion", icon: null,
        content: (<div><Typography.Text type="danger" strong>Warning: This action cannot be undone!</Typography.Text><div style={{ marginTop: 16 }}><Typography.Text>You are about to delete <strong>{toDelete.length} investments</strong> from <strong>{values.delete_month}</strong>.</Typography.Text></div></div>),
        okText: "Delete All", okType: "danger", cancelText: "Cancel",
        onOk: () => {
          setInvestments((prev) => prev.filter((inv) => inv.month_year !== values.delete_month));
          message.success(`Deleted ${toDelete.length} investments from ${values.delete_month}`);
          setIsDeleteMonthModalOpen(false);
          deleteMonthForm.resetFields();
        },
      });
    });
  };

  // ── CRUD ──

  const showModal = (investment?: Investment) => {
    if (investment) {
      const currentMonth = dayjs().format("YYYY-MM");
      const previousMonth = dayjs().subtract(1, "month").format("YYYY-MM");
      const isRecentMonth = investment.month_year === currentMonth || investment.month_year === previousMonth;

      const openEditForm = () => {
        setEditingInvestment(investment);
        setSelectedProduct(investment.product);
        form.setFieldsValue({ ...investment, month_year: dayjs(investment.month_year, "YYYY-MM") });
        if (isUSInvestment(investment.product) && investment.quantidade && investment.quantidade_usd && investment.taxa_usd_brl) {
          setCalculatedValue(investment.quantidade * investment.quantidade_usd * investment.taxa_usd_brl);
        }
        setIsModalOpen(true);
      };

      if (!isRecentMonth) {
        Modal.confirm({
          title: "Edit Historical Record", icon: null,
          content: (<div><Typography.Text type="warning" strong>Warning: You are about to edit a historical record</Typography.Text><div style={{ marginTop: 16 }}><Typography.Text>Investment: <strong>{investment.nome}</strong></Typography.Text><br /><Typography.Text>Period: <strong>{investment.month_year}</strong></Typography.Text><br /><Typography.Text>Current Value: <strong>{formatBRL(investment.valor_atual)}</strong></Typography.Text></div></div>),
          okText: "Edit Record", okType: "danger", cancelText: "Cancel", width: 500, onOk: openEditForm,
        });
      } else openEditForm();
    } else {
      setEditingInvestment(null);
      setSelectedProduct("");
      setCalculatedValue(0);
      form.resetFields();
      form.setFieldsValue({ month_year: dayjs() });
      setIsModalOpen(true);
    }
  };

  const handleCancel = () => { setIsModalOpen(false); setEditingInvestment(null); setSelectedProduct(""); setCalculatedValue(0); form.resetFields(); };

  const handleFormValuesChange = (_changed: Record<string, unknown>, all: Record<string, unknown>) => {
    if (isUSInvestment(all.product as string) && all.quantidade && all.quantidade_usd && all.taxa_usd_brl) {
      setCalculatedValue(parseFloat(String(all.quantidade)) * parseFloat(String(all.quantidade_usd)) * parseFloat(String(all.taxa_usd_brl)));
    } else setCalculatedValue(0);
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      const now = new Date().toISOString();
      const isUS = isUSInvestment(values.product);
      const inv: Investment = {
        key: editingInvestment?.key || Date.now().toString(),
        month_year: values.month_year.format("YYYY-MM"),
        broker: values.broker, holder: values.holder, type: values.type,
        product: values.product, nome: values.nome,
        quantidade: parseFloat(values.quantidade),
        valor_atual: isUS && values.quantidade_usd && values.taxa_usd_brl
          ? parseFloat(values.quantidade) * parseFloat(values.quantidade_usd) * parseFloat(values.taxa_usd_brl)
          : parseFloat(values.valor_atual),
        updated_at: now,
        ...(isUS && { quantidade_usd: values.quantidade_usd ? parseFloat(values.quantidade_usd) : undefined, taxa_usd_brl: values.taxa_usd_brl ? parseFloat(values.taxa_usd_brl) : undefined }),
      };
      if (editingInvestment) {
        setInvestments((prev) => prev.map((i) => (i.key === editingInvestment.key ? inv : i)));
        message.success("Investment updated!");
      } else {
        setInvestments((prev) => [...prev, inv]);
        message.success("Investment added!");
      }
      handleCancel();
    });
  };

  const handleDelete = (key: string) => {
    setInvestments((prev) => prev.filter((inv) => inv.key !== key));
    message.success("Investment deleted!");
  };

  // ── Update Value Modal ──

  const showUpdateValueModal = (investment: Investment) => {
    setUpdatingInvestment(investment);
    updateValueForm.setFieldsValue({
      new_month_year: dayjs().subtract(1, "month").format("YYYY-MM"),
      quantidade: investment.quantidade,
      current_value: investment.valor_atual,
      quantidade_usd: investment.quantidade_usd,
      taxa_usd_brl: investment.taxa_usd_brl,
    });
    if (isUSInvestment(investment.product) && investment.quantidade && investment.quantidade_usd && investment.taxa_usd_brl) {
      setCalculatedValueUpdate(investment.quantidade * investment.quantidade_usd * investment.taxa_usd_brl);
    }
    setIsUpdateValueModalOpen(true);
  };

  const handleUpdateValue = () => {
    updateValueForm.validateFields().then((values) => {
      if (!updatingInvestment) return;
      const now = new Date().toISOString();
      const existing = investments.find((inv) => inv.month_year === values.new_month_year && inv.nome === updatingInvestment.nome && inv.holder === updatingInvestment.holder && inv.broker === updatingInvestment.broker);
      if (existing) { message.warning(`A record for ${updatingInvestment.nome} already exists for ${values.new_month_year}.`); return; }
      const isUS = isUSInvestment(updatingInvestment.product);
      const newRec: Investment = {
        key: `${Date.now()}_${Math.random()}`, month_year: values.new_month_year,
        broker: updatingInvestment.broker, holder: updatingInvestment.holder,
        type: updatingInvestment.type, product: updatingInvestment.product, nome: updatingInvestment.nome,
        quantidade: parseFloat(values.quantidade),
        valor_atual: isUS && values.quantidade_usd && values.taxa_usd_brl
          ? parseFloat(values.quantidade) * parseFloat(values.quantidade_usd) * parseFloat(values.taxa_usd_brl)
          : parseFloat(values.current_value),
        updated_at: now,
        ...(isUS && { quantidade_usd: values.quantidade_usd ? parseFloat(values.quantidade_usd) : undefined, taxa_usd_brl: values.taxa_usd_brl ? parseFloat(values.taxa_usd_brl) : undefined }),
      };
      setInvestments((prev) => [...prev, newRec]);
      message.success(`New record created for ${values.new_month_year}.`);
      setIsUpdateValueModalOpen(false);
      setUpdatingInvestment(null);
      updateValueForm.resetFields();
    });
  };

  const handleUpdateFormValuesChange = (_changed: Record<string, unknown>, all: Record<string, unknown>) => {
    if (updatingInvestment && isUSInvestment(updatingInvestment.product) && all.quantidade && all.quantidade_usd && all.taxa_usd_brl) {
      setCalculatedValueUpdate(parseFloat(String(all.quantidade)) * parseFloat(String(all.quantidade_usd)) * parseFloat(String(all.taxa_usd_brl)));
    } else setCalculatedValueUpdate(0);
  };

  // ── Table Columns ──

  const clearAllFilters = () => { setFilteredInfo({}); message.info("All filters cleared"); };
  const handleTableChange = (_pagination: unknown, filters: Record<string, (boolean | React.Key)[] | null>) => {
    const normalized: FilteredInfo = {};
    for (const [k, v] of Object.entries(filters)) {
      normalized[k] = v ? v.map((x) => (typeof x === "bigint" ? Number(x) : x as string | number | boolean)) : null;
    }
    setFilteredInfo(normalized);
  };

  type FilterValue = boolean | React.Key;

  const getColumns = (showVariance = false) => [
    { title: "Month/Year", dataIndex: "month_year", key: "month_year", sorter: (a: Investment, b: Investment) => a.month_year.localeCompare(b.month_year), filters: uniqueMonths.map((m) => ({ text: m, value: m })), filteredValue: filteredInfo.month_year || null, onFilter: (value: FilterValue, record: Investment) => record.month_year === String(value) },
    { title: "Broker", dataIndex: "broker", key: "broker", sorter: (a: Investment, b: Investment) => a.broker.localeCompare(b.broker), filters: uniqueBrokers.map((b) => ({ text: b, value: b })), filteredValue: filteredInfo.broker || null, onFilter: (value: FilterValue, record: Investment) => record.broker === String(value) },
    { title: "Holder", dataIndex: "holder", key: "holder", sorter: (a: Investment, b: Investment) => a.holder.localeCompare(b.holder), filters: [{ text: "Michel", value: "michel" }, { text: "Carol", value: "carol" }], filteredValue: filteredInfo.holder || null, onFilter: (value: FilterValue, record: Investment) => record.holder === String(value) },
    { title: "Type", dataIndex: "type", key: "type", sorter: (a: Investment, b: Investment) => a.type.localeCompare(b.type), filters: [{ text: "Disponível", value: "available" }, { text: "Bloqueado", value: "frozen" }], filteredValue: filteredInfo.type || null, onFilter: (value: FilterValue, record: Investment) => record.type === String(value) },
    { title: "Product", dataIndex: "product", key: "product", sorter: (a: Investment, b: Investment) => a.product.localeCompare(b.product), filters: productOptions.map((o) => ({ text: o.label, value: o.value })), filteredValue: filteredInfo.product || null, onFilter: (value: FilterValue, record: Investment) => record.product === String(value) },
    {
      title: "Nome (Ticker)", dataIndex: "nome", key: "nome",
      sorter: (a: Investment, b: Investment) => a.nome.localeCompare(b.nome),
      filters: uniqueNomes.map((n) => ({ text: n, value: n })), filteredValue: filteredInfo.nome || null,
      onFilter: (value: FilterValue, record: Investment) => record.nome === String(value), filterSearch: true,
      render: (value: string, record: Investment) => {
        if (!showVariance) return value;
        const prev = investments.filter((inv) => inv.month_year < record.month_year && inv.nome === record.nome && inv.holder === record.holder && inv.broker === record.broker);
        return (<Space>{value}{prev.length === 0 && <Tag icon={<Star size={12} />} style={{ backgroundColor: "#531dab", color: "white", borderColor: "#531dab" }}>NEW</Tag>}</Space>);
      },
    },
    { title: "Amount (USD)", dataIndex: "quantidade_usd", key: "quantidade_usd", align: "right" as const, render: (v: number | undefined) => v ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-", sorter: (a: Investment, b: Investment) => (a.quantidade_usd || 0) - (b.quantidade_usd || 0) },
    { title: "Exchange Rate", dataIndex: "taxa_usd_brl", key: "taxa_usd_brl", align: "right" as const, render: (v: number | undefined) => v ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : "-", sorter: (a: Investment, b: Investment) => (a.taxa_usd_brl || 0) - (b.taxa_usd_brl || 0) },
    {
      title: "Quantidade", dataIndex: "quantidade", key: "quantidade", align: "right" as const,
      render: (value: number, record: Investment) => {
        if (!showVariance) return value.toLocaleString();
        const prev = investments.filter((inv) => inv.month_year < record.month_year && inv.nome === record.nome && inv.holder === record.holder && inv.broker === record.broker).sort((a, b) => b.month_year.localeCompare(a.month_year))[0];
        const variance = prev ? value - prev.quantidade : value;
        return (<Space direction="vertical" size={0}><span>{value.toLocaleString()}</span>{prev ? (variance !== 0 ? <Typography.Text type={variance > 0 ? "success" : "danger"} style={{ fontSize: 11 }}>{variance > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}{Math.abs(variance).toLocaleString()} ({prev.quantidade.toLocaleString()})</Typography.Text> : <Typography.Text type="secondary" style={{ fontSize: 11 }}><Minus size={10} /> No change</Typography.Text>) : (variance !== 0 && <Typography.Text type="success" style={{ fontSize: 11 }}><ArrowUp size={10} />{Math.abs(variance).toLocaleString()}</Typography.Text>)}</Space>);
      },
      sorter: (a: Investment, b: Investment) => a.quantidade - b.quantidade,
    },
    {
      title: "Valor Atual", dataIndex: "valor_atual", key: "valor_atual", align: "right" as const,
      render: (value: number, record: Investment) => {
        if (!showVariance) return formatBRL(value);
        const prev = investments.filter((inv) => inv.month_year < record.month_year && inv.nome === record.nome && inv.holder === record.holder && inv.broker === record.broker).sort((a, b) => b.month_year.localeCompare(a.month_year))[0];
        const variance = prev ? value - prev.valor_atual : value;
        return (<Space direction="vertical" size={0}><span>{formatBRL(value)}</span>{prev ? (variance !== 0 ? <Typography.Text type={variance > 0 ? "success" : "danger"} style={{ fontSize: 11 }}>{variance > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}{formatBRL(Math.abs(variance))} ({formatBRL(prev.valor_atual)})</Typography.Text> : <Typography.Text type="secondary" style={{ fontSize: 11 }}><Minus size={10} /> No change</Typography.Text>) : (variance !== 0 && <Typography.Text type="success" style={{ fontSize: 11 }}><ArrowUp size={10} />{formatBRL(Math.abs(variance))}</Typography.Text>)}</Space>);
      },
      sorter: (a: Investment, b: Investment) => a.valor_atual - b.valor_atual,
    },
    { title: "Updated At", dataIndex: "updated_at", key: "updated_at", render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm:ss"), sorter: (a: Investment, b: Investment) => a.updated_at.localeCompare(b.updated_at) },
  ];

  // ── Section View (tree) ──

  const getFilteredInvestments = () => {
    let filtered = investments.filter((inv) => inv.month_year === selectedMonth);
    if (selectedHolder !== "all") filtered = filtered.filter((inv) => inv.holder === selectedHolder);
    if (selectedBroker !== "all") filtered = filtered.filter((inv) => inv.broker === selectedBroker);
    if (selectedType !== "all") filtered = filtered.filter((inv) => inv.type === selectedType);
    return filtered;
  };

  const getGroupedByProduct = () => {
    const filtered = getFilteredInvestments();
    const grouped = filtered.reduce((acc: Record<string, Investment[]>, inv) => {
      if (!acc[inv.product]) acc[inv.product] = [];
      acc[inv.product].push(inv);
      return acc;
    }, {});
    return productOrder.map((product) => {
      const items = grouped[product] || [];
      return { product, items, totalValue: items.reduce((s, inv) => s + inv.valor_atual, 0), count: items.length };
    });
  };

  // ── Comparison View ──

  const getComparisonData = (): ComparisonRow[] => {
    if (comparisonMonths.length === 0) return [];
    const data: ComparisonRow[] = [];
    const typeGroups = { available: productOrder, frozen: productOrder };

    Object.entries(typeGroups).forEach(([type, products]) => {
      const typeLabel = type === "available" ? "Disponível" : "Bloqueado";
      const typeSubtotal: ComparisonRow = { key: `subtotal_${type}`, type: typeLabel, product: `SUBTOTAL ${typeLabel.toUpperCase()}`, isSubtotal: true };

      products.forEach((product) => {
        const row: ComparisonRow = { key: `${type}_${product}`, type: typeLabel, product };
        comparisonMonths.forEach((month) => {
          const value = investments.filter((inv) => inv.month_year === month && inv.type === type && inv.product === product).reduce((sum, inv) => sum + inv.valor_atual, 0);
          row[month] = value;
          typeSubtotal[month] = (Number(typeSubtotal[month]) || 0) + value;
        });
        if (comparisonMonths.some((m) => Number(row[m]) > 0)) data.push(row);
      });

      if (comparisonMonths.some((m) => Number(typeSubtotal[m]) > 0)) data.push(typeSubtotal);
    });

    const totalRow: ComparisonRow = { key: "total", type: "TOTAL", product: "TOTAL GERAL", isTotal: true };
    comparisonMonths.forEach((month) => { totalRow[month] = investments.filter((inv) => inv.month_year === month).reduce((sum, inv) => sum + inv.valor_atual, 0); });
    data.push(totalRow);
    return data;
  };

  const getComparisonColumns = (rows?: ComparisonRow[]) => {
    // Precompute rowSpan map for merged Type column
    const rowSpans: Record<string, number> = {};
    if (mergeTypeColumn && rows) {
      let i = 0;
      while (i < rows.length) {
        const r = rows[i];
        if (r.isTotal || r.isSubtotal) { rowSpans[String(r.key)] = 1; i++; continue; }
        let j = i + 1;
        while (j < rows.length && !rows[j].isTotal && !rows[j].isSubtotal && rows[j].type === r.type) j++;
        rowSpans[String(r.key)] = j - i;
        for (let k = i + 1; k < j; k++) rowSpans[String(rows[k].key)] = 0;
        i = j;
      }
    }
    const columns: Array<{ title: string; dataIndex?: string; key: string; fixed?: "left"; width?: number; align?: "right" | "center"; render?: (value: unknown, record: ComparisonRow) => React.ReactNode; onCell?: (record: ComparisonRow) => { rowSpan?: number; style?: React.CSSProperties }; sorter?: (a: ComparisonRow, b: ComparisonRow) => number }> = [
      {
        title: "Type", dataIndex: "type", key: "type", fixed: "left", width: 120,
        align: mergeTypeColumn ? "center" : undefined,
        render: (value: unknown, record: ComparisonRow) => record.isTotal ? <Typography.Text strong>{String(value)}</Typography.Text> : record.isSubtotal ? "" : String(value),
        onCell: mergeTypeColumn ? (record: ComparisonRow) => ({
          rowSpan: rowSpans[String(record.key)] ?? 1,
          style: { verticalAlign: "middle", textAlign: "center" },
        }) : undefined,
      },
      { title: "Product", dataIndex: "product", key: "product", fixed: "left", width: 250, render: (value: unknown, record: ComparisonRow) => (record.isTotal || record.isSubtotal) ? <Typography.Text strong>{String(value)}</Typography.Text> : String(value) },
    ];

    comparisonMonths.forEach((month, index) => {
      columns.push({
        title: month, dataIndex: month, key: month, align: "right", width: 150,
        render: (value: unknown = 0, record: ComparisonRow) => {
          const formatted = formatBRL(Number(value));
          if (record.isTotal) return <Typography.Text strong style={{ color: "#1890ff" }}>{formatted}</Typography.Text>;
          if (record.isSubtotal) return <Typography.Text strong>{formatted}</Typography.Text>;
          return formatted;
        },
      });
      if (index < comparisonMonths.length - 1) {
        const curr = month, next = comparisonMonths[index + 1];
        columns.push({
          title: `Δ ${month.substring(5)} → ${next.substring(5)}`, key: `variance_${index}`, align: "right", width: 130,
          render: (_: unknown, record: ComparisonRow) => {
            const variance = Number(record[next] ?? 0) - Number(record[curr] ?? 0);
            if (variance === 0) return <Typography.Text type="secondary" style={{ fontSize: 11 }}><Minus size={10} /></Typography.Text>;
            const color = variance > 0 ? "success" as const : "danger" as const;
            const icon = variance > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
            return <Typography.Text type={color} strong={record.isTotal || record.isSubtotal || undefined}>{icon} {formatBRL(Math.abs(variance))}</Typography.Text>;
          },
        });
      }
    });
    return columns;
  };

  const getDetailedComparisonColumns = () => {
    const isAgg = (r: DetailedComparisonRow) => r.isTotal || r.isSubtotal || r.isProductRow;
    const renderVariance = (variance: number, record: DetailedComparisonRow, fmt: (v: number) => string) => {
      if (variance === 0) return <Typography.Text type="secondary" style={{ fontSize: 11 }}><Minus size={10} /></Typography.Text>;
      const color = variance > 0 ? "success" as const : "danger" as const;
      const icon = variance > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
      return <Typography.Text type={color} strong={isAgg(record) || undefined}>{icon} {fmt(Math.abs(variance))}</Typography.Text>;
    };

    const columns: Array<{ title: string; dataIndex?: string; key: string; fixed?: "left"; width?: number; align?: "right"; render?: (value: unknown, record: DetailedComparisonRow) => React.ReactNode }> = [
      { title: "Product", dataIndex: "product", key: "product", fixed: "left", width: 220, render: (v: unknown, r: DetailedComparisonRow) => (r.isTotal || r.isSubtotal || r.isProductRow) ? <Typography.Text strong>{String(v)}</Typography.Text> : String(v) },
      { title: "Nome (Ticker)", dataIndex: "nome", key: "nome", fixed: "left", width: 180, render: (v: unknown) => String(v ?? "") },
    ];

    comparisonMonths.forEach((month, index) => {
      columns.push({
        title: month, dataIndex: month, key: month, align: "right", width: 150,
        render: (value: unknown = 0, record: DetailedComparisonRow) => {
          const formatted = formatBRL(Number(value));
          if (record.isTotal) return <Typography.Text strong style={{ color: "#1890ff" }}>{formatted}</Typography.Text>;
          if (record.isSubtotal || record.isProductRow) return <Typography.Text strong>{formatted}</Typography.Text>;
          return formatted;
        },
      });
      if (index < comparisonMonths.length - 1) {
        const curr = month, next = comparisonMonths[index + 1];
        columns.push({ title: `Δ Qty ${month.substring(5)}→${next.substring(5)}`, key: `qty_variance_${index}`, align: "right", width: 120, render: (_: unknown, r: DetailedComparisonRow) => { if (isAgg(r)) return ""; return renderVariance(Number(r[`qty_${next}`] ?? 0) - Number(r[`qty_${curr}`] ?? 0), r, (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 })); } });
        columns.push({ title: `Δ ${month.substring(5)} → ${next.substring(5)}`, key: `variance_detailed_${index}`, align: "right", width: 130, render: (_: unknown, r: DetailedComparisonRow) => renderVariance(Number(r[next] ?? 0) - Number(r[curr] ?? 0), r, formatBRL) });
      }
    });
    return columns;
  };

  // ── Summary View ──

  const getSummaryData = () => {
    const latestMonth = uniqueMonthsForFilter[0] || "";
    const latest = investments.filter((inv) => inv.month_year === latestMonth);
    if (latest.length === 0) return null;

    const previousMonth = uniqueMonthsForFilter[1] || "";
    const prev = previousMonth ? investments.filter((inv) => inv.month_year === previousMonth) : [];

    const totalValue = latest.reduce((s, inv) => s + inv.valor_atual, 0);
    const michelTotal = latest.filter((inv) => inv.holder === "michel").reduce((s, inv) => s + inv.valor_atual, 0);
    const carolTotal = latest.filter((inv) => inv.holder === "carol").reduce((s, inv) => s + inv.valor_atual, 0);
    const availableTotal = latest.filter((inv) => inv.type === "available").reduce((s, inv) => s + inv.valor_atual, 0);
    const frozenTotal = latest.filter((inv) => inv.type === "frozen").reduce((s, inv) => s + inv.valor_atual, 0);

    const previousTotal = prev.reduce((s, inv) => s + inv.valor_atual, 0);
    const previousMichelTotal = prev.filter((inv) => inv.holder === "michel").reduce((s, inv) => s + inv.valor_atual, 0);
    const previousCarolTotal = prev.filter((inv) => inv.holder === "carol").reduce((s, inv) => s + inv.valor_atual, 0);

    const byProduct = productOrder.map((product) => {
      const items = latest.filter((inv) => inv.product === product);
      const value = items.reduce((s, inv) => s + inv.valor_atual, 0);
      const avail = items.filter((inv) => inv.type === "available").reduce((s, inv) => s + inv.valor_atual, 0);
      const frozen = items.filter((inv) => inv.type === "frozen").reduce((s, inv) => s + inv.valor_atual, 0);
      const prevValue = prev.filter((inv) => inv.product === product).reduce((s, inv) => s + inv.valor_atual, 0);
      return { product, value, available: avail, frozen, variance: prevValue > 0 ? value - prevValue : null, variancePercent: prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : null };
    }).filter((i) => i.value > 0);

    const brokerMap: Record<string, { total: number; available: number; frozen: number }> = {};
    const prevBrokerMap: Record<string, number> = {};
    latest.forEach((inv) => {
      if (!brokerMap[inv.broker]) brokerMap[inv.broker] = { total: 0, available: 0, frozen: 0 };
      brokerMap[inv.broker].total += inv.valor_atual;
      if (inv.type === "frozen") brokerMap[inv.broker].frozen += inv.valor_atual;
      else brokerMap[inv.broker].available += inv.valor_atual;
    });
    prev.forEach((inv) => { prevBrokerMap[inv.broker] = (prevBrokerMap[inv.broker] || 0) + inv.valor_atual; });
    const byBroker = Object.keys(brokerMap).map((broker) => {
      const { total: value, available: avail, frozen } = brokerMap[broker];
      const pv = prevBrokerMap[broker] || 0;
      return { broker, value, available: avail, frozen, variance: pv > 0 ? value - pv : null, variancePercent: pv > 0 ? ((value - pv) / pv) * 100 : null };
    });

    const holderMap: Record<string, { total: number; available: number; frozen: number }> = {};
    const prevHolderMap: Record<string, number> = {};
    latest.forEach((inv) => {
      if (!holderMap[inv.holder]) holderMap[inv.holder] = { total: 0, available: 0, frozen: 0 };
      holderMap[inv.holder].total += inv.valor_atual;
      if (inv.type === "frozen") holderMap[inv.holder].frozen += inv.valor_atual;
      else holderMap[inv.holder].available += inv.valor_atual;
    });
    prev.forEach((inv) => { prevHolderMap[inv.holder] = (prevHolderMap[inv.holder] || 0) + inv.valor_atual; });
    const byHolder = Object.keys(holderMap).map((holder) => {
      const { total: value, available: avail, frozen } = holderMap[holder];
      const pv = prevHolderMap[holder] || 0;
      return { holder, value, available: avail, frozen, variance: pv > 0 ? value - pv : null, variancePercent: pv > 0 ? ((value - pv) / pv) * 100 : null };
    });

    const totalVariance = previousTotal > 0 ? totalValue - previousTotal : null;
    return {
      latestMonth, totalValue, michelTotal, carolTotal, availableTotal, frozenTotal,
      byProduct, byBroker, byHolder, totalVariance,
      variancePercent: previousTotal > 0 ? ((totalValue - previousTotal) / previousTotal) * 100 : null,
      michelVariance: previousMichelTotal > 0 ? michelTotal - previousMichelTotal : null,
      carolVariance: previousCarolTotal > 0 ? carolTotal - previousCarolTotal : null,
      investmentCount: latest.length,
    };
  };

  // ── US Form Fields Helper ──

  const renderUSFields = (formInstance: ReturnType<typeof Form.useForm>[0], calcValue: number) => (
    <>
      <Form.Item name="quantidade" label="Quantity (Shares)" rules={[{ required: true, message: "Please enter quantity" }, { pattern: /^\d+(\.\d+)?$/, message: "Enter a valid number" }]}>
        <Input type="number" step="0.01" placeholder="0.00" />
      </Form.Item>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="quantidade_usd" label="Amount (USD)" rules={[{ required: true, message: "Enter USD amount" }, { pattern: /^\d+(\.\d+)?$/, message: "Enter a valid number" }]}>
            <Input type="number" step="0.01" placeholder="0.00" prefix="$" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="taxa_usd_brl" label="Exchange Rate (USD → BRL)" rules={[{ required: true, message: "Enter exchange rate" }, { pattern: /^\d+(\.\d+)?$/, message: "Enter a valid number" }]}>
            <Input type="number" step="0.0001" placeholder="5.50" prefix="R$" />
          </Form.Item>
        </Col>
      </Row>
      <Card size="small" style={{ backgroundColor: "#f0f5ff", marginTop: 16 }}>
        <Space direction="vertical" size={0}>
          <Typography.Text strong>Calculated Value (BRL):</Typography.Text>
          <Typography.Title level={4} style={{ margin: 0, color: "#1890ff" }}>{calcValue > 0 ? formatBRL(calcValue) : "R$ 0,00"}</Typography.Title>
          {calcValue > 0 && <Typography.Text type="secondary" style={{ fontSize: 11 }}>{formInstance.getFieldValue("quantidade")} shares × ${formInstance.getFieldValue("quantidade_usd")} × R${formInstance.getFieldValue("taxa_usd_brl")}</Typography.Text>}
        </Space>
      </Card>
    </>
  );

  const renderBRLFields = () => (
    <Row gutter={16}>
      <Col span={12}>
        <Form.Item name="quantidade" label="Quantidade" rules={[{ required: true, message: "Enter quantity" }, { pattern: /^\d+(\.\d+)?$/, message: "Enter a valid number" }]}>
          <Input type="number" step="0.01" placeholder="0.00" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="valor_atual" label="Valor Atual (R$)" rules={[{ required: true, message: "Enter current value" }, { pattern: /^\d+(\.\d+)?$/, message: "Enter a valid number" }]}>
          <Input type="number" step="0.01" placeholder="0.00" />
        </Form.Item>
      </Col>
    </Row>
  );

  const renderUpdateBRLFields = () => (
    <Row gutter={16}>
      <Col span={12}>
        <Form.Item name="quantidade" label="Quantity" rules={[{ required: true, message: "Enter quantity" }, { pattern: /^\d+(\.\d+)?$/, message: "Enter a valid number" }]}>
          <Input type="number" step="0.01" placeholder="0.00" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="current_value" label="Current Value (R$)" rules={[{ required: true, message: "Enter new value" }, { pattern: /^\d+(\.\d+)?$/, message: "Enter a valid number" }]}>
          <Input type="number" step="0.01" placeholder="0.00" />
        </Form.Item>
      </Col>
    </Row>
  );

  // ── Render ──

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        {/* Header */}
        {(() => {
          const monthsWithTotals = uniqueMonths.map((m) => ({
            month: m,
            net: investments.filter((inv) => inv.month_year === m).reduce((s, inv) => s + inv.valor_atual, 0),
          }));
          return (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <PiggyBank size={20} color="#8c8c8c" />
                <Title level={4} style={{ margin: 0, fontWeight: 400 }}>Investimentos</Title>
                <RefreshCw
                  size={16}
                  color="#8c8c8c"
                  style={{ cursor: "pointer", animation: refreshing ? "spin 1s linear infinite" : undefined }}
                  onClick={handleRefresh}
                />
                {redacted ? (
                  <EyeOff size={16} color="#8c8c8c" style={{ cursor: "pointer" }} onClick={toggleRedact} />
                ) : (
                  <Eye size={16} color="#8c8c8c" style={{ cursor: "pointer" }} onClick={toggleRedact} />
                )}
              </div>
              {monthsWithTotals.length > 0 && (
                <MonthSelector months={monthsWithTotals} selected={selectedMonth} onSelect={setSelectedMonth} />
              )}
            </div>
          );
        })()}

        {/* Views Card */}
        <Card
          title={
            <Segmented
              value={viewMode}
              onChange={(v) => setViewMode(v as typeof viewMode)}
              options={[
                { label: <Space><LayoutDashboard size={16} />Summary</Space>, value: "summary" },
                { label: <Space><TableIcon size={16} />Table View</Space>, value: "table" },
                { label: <Space><Network size={16} />Section View</Space>, value: "tree" },
                { label: <Space><BarChart3 size={16} />Comparison</Space>, value: "comparison" },
                { label: <Space><FileSpreadsheet size={16} />Reports</Space>, value: "reports" },
              ]}
            />
          }
          extra={viewMode === "table" && <Button icon={<FilterX size={16} />} onClick={clearAllFilters} size="small">Clear Filters</Button>}
        >
          {/* ── Summary View ── */}
          {viewMode === "summary" && (() => {
            const summary = getSummaryData();
            if (!summary) return <Typography.Text type="secondary">No data available for summary view.</Typography.Text>;
            const MASK = "••••••";
            const r = (v: number) => redacted ? MASK : formatBRL(v);
            const statFmt = (_: unknown) => redacted ? MASK : `R$ ${Number(_).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

            const renderBreakdownItem = (item: { value: number; available: number; frozen: number; variance: number | null; variancePercent: number | null }, label: string, key: string) => {
              const totalPct = summary.totalValue > 0 ? (item.value / summary.totalValue) * 100 : 0;
              const availPct = summary.totalValue > 0 ? (item.available / summary.totalValue) * 100 : 0;
              const frozenPct = summary.totalValue > 0 ? (item.frozen / summary.totalValue) * 100 : 0;
              const frozenOfItem = item.value > 0 ? (item.frozen / item.value) * 100 : 0;
              const frozenPctPortfolio = summary.totalValue > 0 ? (item.frozen / summary.totalValue) * 100 : 0;
              return (
                <div key={key} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <Typography.Text strong>{label}</Typography.Text>
                    <Space size="small">
                      <Typography.Text strong style={{ fontSize: 16 }}>{r(item.value)}</Typography.Text>
                      {item.variance !== null && !redacted && <Tag color={item.variance > 0 ? "green" : item.variance < 0 ? "red" : "default"} style={{ fontSize: 10 }}>{item.variance > 0 ? "↑" : item.variance < 0 ? "↓" : "−"}{r(Math.abs(item.variance))}</Tag>}
                    </Space>
                  </div>
                  <div style={{ display: "flex", width: "100%", height: 6, backgroundColor: "#f0f0f0", borderRadius: 3, marginBottom: 4, overflow: "hidden" }}>
                    <div style={{ width: `${availPct}%`, height: "100%", backgroundColor: "#52c41a" }} />
                    <div style={{ width: `${frozenPct}%`, height: "100%", backgroundColor: "#ff4d4f" }} />
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {totalPct.toFixed(1)}%{item.variancePercent !== null && ` (${item.variancePercent > 0 ? "+" : ""}${item.variancePercent.toFixed(1)}%)`}
                    {item.frozen > 0 && !redacted && <span style={{ color: "#ff4d4f" }}> · bloqueado {r(item.frozen)} ({frozenOfItem.toFixed(1)}% do item = {frozenPctPortfolio.toFixed(1)}% do total)</span>}
                  </Typography.Text>
                </div>
              );
            };

            return (
              <Row gutter={24}>
                {/* Column 1 — Totals */}
                <Col xs={24} md={8}>
                  <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                    <Card>
                      <Space align="center" style={{ marginBottom: 8 }}>
                        <Typography.Title level={4} style={{ margin: 0 }}>Portfolio Summary</Typography.Title>
                        <Tag>{summary.latestMonth}</Tag>
                        {summary.totalVariance !== null && !redacted && (
                          <Tag color={summary.totalVariance > 0 ? "green" : summary.totalVariance < 0 ? "red" : "default"} icon={summary.totalVariance > 0 ? <ArrowUp size={14} /> : summary.totalVariance < 0 ? <ArrowDown size={14} /> : <Minus size={14} />}>
                            {summary.variancePercent !== null && `${summary.variancePercent > 0 ? "+" : ""}${summary.variancePercent.toFixed(2)}%`}
                          </Tag>
                        )}
                      </Space>
                      <Statistic title="Total Portfolio" value={summary.totalValue} precision={2} prefix="R$" valueStyle={{ color: "#1890ff" }} formatter={statFmt}
                        suffix={summary.totalVariance !== null && !redacted && <Typography.Text type={summary.totalVariance > 0 ? "success" : summary.totalVariance < 0 ? "danger" : "secondary"} style={{ fontSize: 14 }}>{summary.totalVariance > 0 ? "↑" : summary.totalVariance < 0 ? "↓" : "−"}{formatBRL(Math.abs(summary.totalVariance))}</Typography.Text>}
                      />
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{summary.investmentCount} investments</Typography.Text>
                    </Card>
                    <Card>
                      <Statistic title="Available Funds" value={summary.availableTotal} precision={2} prefix="R$" valueStyle={{ color: "#52c41a" }} formatter={statFmt} />
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{summary.totalValue > 0 ? ((summary.availableTotal / summary.totalValue) * 100).toFixed(1) : 0}% of portfolio</Typography.Text>
                    </Card>
                    <Card>
                      <Statistic title="Frozen Funds" value={summary.frozenTotal} precision={2} prefix="R$" valueStyle={{ color: "#ff4d4f" }} formatter={statFmt} />
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{summary.totalValue > 0 ? ((summary.frozenTotal / summary.totalValue) * 100).toFixed(1) : 0}% of portfolio</Typography.Text>
                    </Card>
                  </Space>
                </Col>

                {/* Column 2 — Breakdown view */}
                <Col xs={24} md={16}>
                  <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                    <Segmented
                      value={summaryView}
                      onChange={(v) => setSummaryView(v as typeof summaryView)}
                      block
                      options={[
                        { label: <Space><Building2 size={14} />Por Broker</Space>, value: "broker" },
                        { label: <Space><BarChart3 size={14} />Por Produto</Space>, value: "product" },
                        { label: <Space><Users size={14} />Por Holder</Space>, value: "holder" },
                      ]}
                    />

                    {summaryView === "broker" && (
                      <Card>
                        {summary.byBroker.sort((a, b) => b.value - a.value).map((item) =>
                          renderBreakdownItem(item, item.broker, item.broker)
                        )}
                      </Card>
                    )}

                    {summaryView === "product" && (
                      <Card>
                        {summary.byProduct.sort((a, b) => b.value - a.value).map((item) =>
                          renderBreakdownItem(item, item.product, item.product)
                        )}
                      </Card>
                    )}

                    {summaryView === "holder" && (
                      <Card>
                        {summary.byHolder.sort((a, b) => b.value - a.value).map((item) =>
                          renderBreakdownItem(item, item.holder, item.holder)
                        )}
                      </Card>
                    )}
                  </Space>
                </Col>
              </Row>
            );
          })()}

          {/* ── Table View ── */}
          {viewMode === "table" && (
            <Table columns={getColumns(false)} dataSource={investments} pagination={{ defaultPageSize: 100, pageSize: 100, showSizeChanger: true, pageSizeOptions: ["50", "100", "200", "500"], showTotal: (total) => `Total ${total} investments` }} scroll={{ x: 1200 }} size="small" onChange={handleTableChange} />
          )}

          {/* ── Comparison View ── */}
          {viewMode === "comparison" && (
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <Card size="small">
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Typography.Text strong>Select Months to Compare:</Typography.Text>
                    <Space size="middle">
                      <Checkbox checked={showSubtotals} onChange={(e) => setShowSubtotals(e.target.checked)}>
                        Show Subtotals
                      </Checkbox>
                      <Checkbox checked={showBloqueado} onChange={(e) => setShowBloqueado(e.target.checked)}>
                        Show Bloqueado
                      </Checkbox>
                      <Checkbox checked={mergeTypeColumn} onChange={(e) => setMergeTypeColumn(e.target.checked)}>
                        Merge Type
                      </Checkbox>
                      <Segmented size="small" value={comparisonDetailMode} onChange={(v) => setComparisonDetailMode(v as "summary" | "detailed")} options={[{ label: "Summary", value: "summary" }, { label: "Detailed", value: "detailed" }]} />
                    </Space>
                  </Space>
                  <Select mode="multiple" style={{ width: "100%" }} placeholder="Select months to compare" value={comparisonMonths} onChange={setComparisonMonths} options={uniqueMonthsForFilter.map((m) => ({ label: m, value: m }))} maxTagCount="responsive" />
                </Space>
              </Card>
              {comparisonMonths.length > 0 ? (
                comparisonDetailMode === "summary" ? (
                  (() => {
                    const raw = getComparisonData();
                    let rows = raw;
                    if (!showBloqueado) {
                      rows = raw.filter((r) => r.type !== "Bloqueado" && r.key !== "subtotal_frozen");
                      const availSubtotal = rows.find((r) => r.key === "subtotal_available");
                      const totalRow = rows.find((r) => r.isTotal);
                      if (totalRow && availSubtotal) {
                        comparisonMonths.forEach((m) => { totalRow[m] = Number(availSubtotal[m]) || 0; });
                      }
                    }
                    if (!showSubtotals) rows = rows.filter((r) => !r.isSubtotal);
                    return <Table columns={getComparisonColumns(rows)} dataSource={rows} pagination={false} size="small" scroll={{ x: 1200 }} rowClassName={(r) => r.isTotal ? "total-row" : r.isSubtotal ? "subtotal-row" : ""} />;
                  })()
                ) : (
                  <>
                    <Space size="small">
                      <Button size="small" icon={<ChevronDown size={14} />} onClick={() => setDetailedExpandedKeys(getDetailedComparisonData().filter((r) => r.children && r.children.length > 0).map((r) => r.key))}>Expand All</Button>
                      <Button size="small" icon={<ChevronUp size={14} />} onClick={() => setDetailedExpandedKeys([])}>Collapse All</Button>
                    </Space>
                    {(() => {
                      const raw = getDetailedComparisonData();
                      let rows = raw;
                      if (!showBloqueado) {
                        rows = raw.filter((r) => !String(r.key).startsWith("frozen_") && r.key !== "subtotal_frozen");
                        const availSubtotal = rows.find((r) => r.key === "subtotal_available");
                        const totalRow = rows.find((r) => r.isTotal);
                        if (totalRow && availSubtotal) {
                          comparisonMonths.forEach((m) => { totalRow[m] = Number(availSubtotal[m]) || 0; });
                        }
                      }
                      if (!showSubtotals) rows = rows.filter((r) => !r.isSubtotal);
                      return <Table columns={getDetailedComparisonColumns()} dataSource={rows} pagination={false} size="small" scroll={{ x: 1400 }} expandable={{ expandedRowKeys: detailedExpandedKeys, onExpandedRowsChange: (keys) => setDetailedExpandedKeys(keys as unknown as string[]), rowExpandable: (r: DetailedComparisonRow) => !!(r.children && r.children.length > 0) }} rowClassName={(r) => r.isTotal ? "total-row" : (r.isSubtotal || r.isProductRow) ? "subtotal-row" : ""} />;
                    })()}
                  </>
                )
              ) : <Card><Typography.Text type="secondary">Please select at least one month.</Typography.Text></Card>}
            </Space>
          )}

          {/* ── Reports View (markdown files) ── */}
          {viewMode === "reports" && (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              {reports.length === 0 ? (
                <Typography.Text type="secondary">
                  Nenhum arquivo .md encontrado em resources/{"{household}"}/{"{YYYY-MM}"}/investments/result/
                </Typography.Text>
              ) : (
                (() => {
                  const grouped = reports.reduce((acc: Record<string, typeof reports>, r) => {
                    (acc[r.month] = acc[r.month] || []).push(r);
                    return acc;
                  }, {});
                  const months = Object.keys(grouped).sort().reverse();
                  const options = months.flatMap((m) =>
                    grouped[m].map((r) => ({
                      label: `${m} · ${r.title}`,
                      value: `${r.month}__${r.filename}`,
                    }))
                  );
                  const current = reports.find((r) => `${r.month}__${r.filename}` === selectedReport) || reports[0];
                  return (
                    <>
                      <Card size="small">
                        <Space direction="vertical" style={{ width: "100%" }}>
                          <Typography.Text strong>Selecione o relatório:</Typography.Text>
                          <Select
                            value={selectedReport || `${reports[0].month}__${reports[0].filename}`}
                            onChange={setSelectedReport}
                            options={options}
                            style={{ width: "100%", maxWidth: 500 }}
                          />
                        </Space>
                      </Card>
                      <Card>
                        <MarkdownView source={current.content} />
                      </Card>
                    </>
                  );
                })()
              )}
            </Space>
          )}

          {/* ── Section View (tree) ── */}
          {viewMode === "tree" && (
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <Card size="small" extra={<Space size="small"><Button size="small" icon={<ChevronDown size={14} />} onClick={() => setActiveCollapseKeys(productOrder)}>Expand All</Button><Button size="small" icon={<ChevronUp size={14} />} onClick={() => setActiveCollapseKeys([])}>Collapse All</Button></Space>}>
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <div>
                    <Typography.Text strong>Select Period:</Typography.Text>
                    <div style={{ marginTop: 8 }}><Radio.Group value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} buttonStyle="solid">{uniqueMonthsForFilter.map((m) => <Radio.Button key={m} value={m}>{m}</Radio.Button>)}</Radio.Group></div>
                  </div>
                  <div>
                    <Typography.Text strong>Filter by Holder:</Typography.Text>
                    <div style={{ marginTop: 8 }}><Radio.Group value={selectedHolder} onChange={(e) => setSelectedHolder(e.target.value)} buttonStyle="solid"><Radio.Button value="all">All Holders</Radio.Button><Radio.Button value="michel">Michel</Radio.Button><Radio.Button value="carol">Carol</Radio.Button></Radio.Group></div>
                  </div>
                  <div>
                    <Typography.Text strong>Filter by Broker:</Typography.Text>
                    <div style={{ marginTop: 8 }}><Radio.Group value={selectedBroker} onChange={(e) => setSelectedBroker(e.target.value)} buttonStyle="solid"><Radio.Button value="all">All Brokers</Radio.Button>{uniqueBrokersForFilter.map((b) => <Radio.Button key={b} value={b}>{b}</Radio.Button>)}</Radio.Group></div>
                  </div>
                  <div>
                    <Typography.Text strong>Filter by Type:</Typography.Text>
                    <div style={{ marginTop: 8 }}><Radio.Group value={selectedType} onChange={(e) => setSelectedType(e.target.value)} buttonStyle="solid"><Radio.Button value="all">All Types</Radio.Button><Radio.Button value="available">Disponível</Radio.Button><Radio.Button value="frozen">Bloqueado</Radio.Button></Radio.Group></div>
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Showing investments for {selectedMonth}{selectedHolder !== "all" ? ` · ${selectedHolder}` : ""}{selectedBroker !== "all" ? ` · ${selectedBroker}` : ""}{selectedType !== "all" ? ` · ${selectedType === "available" ? "Disponível" : "Bloqueado"}` : ""}</Typography.Text>
                </Space>
              </Card>

              <Collapse
                activeKey={activeCollapseKeys}
                onChange={(keys) => setActiveCollapseKeys(keys as string[])}
                items={getGroupedByProduct().map((group) => {
                  const sectionColumns = getColumns(true).map((col) => { const { filteredValue: _, ...rest } = col; return rest; });
                  return {
                    key: group.product,
                    label: (<Space style={{ width: "100%", justifyContent: "space-between" }}><Space><Typography.Text strong style={{ fontSize: 16 }}>{group.product}</Typography.Text><Typography.Text type="secondary">({group.count} investments)</Typography.Text></Space><Typography.Text strong style={{ fontSize: 16 }}>{formatBRL(group.totalValue)}</Typography.Text></Space>),
                    children: group.items.length > 0 ? <Table columns={sectionColumns} dataSource={group.items} pagination={false} size="small" scroll={{ x: 1200 }} /> : <Typography.Text type="secondary">No investments for this period.</Typography.Text>,
                  };
                })}
              />
            </Space>
          )}
        </Card>
      </Space>

      <style jsx global>{`
        .total-row > td { background: rgba(24, 144, 255, 0.22) !important; font-weight: 700; }
        .total-row:hover > td { background: rgba(24, 144, 255, 0.3) !important; }
        .subtotal-row > td,
        .subtotal-row > td .ant-typography,
        .subtotal-row > td span { color: #1677ff !important; font-weight: 600; }
      `}</style>
    </div>
  );
}
