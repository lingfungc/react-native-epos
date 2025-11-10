import { generateRandomOrder } from "@/constants/orders";
import database, { ordersCollection } from "@/db";
import Order from "@/models/Order";
import { Q } from "@nozbe/watermelondb";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type OrderStatus = "open" | "closed" | "voided";

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const subscription = ordersCollection
      .query(Q.sortBy("created_at", Q.desc))
      .observe()
      .subscribe((ordersData) => {
        console.log("Orders: ", ordersData);
        setOrders(ordersData);
        setLoading(false);
        setRefreshing(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    // The observe subscription will automatically update when data changes
    // Just wait a moment for the refresh to complete
    setTimeout(() => setRefreshing(false), 500);
  };

  const createOrder = async () => {
    try {
      const orderData = generateRandomOrder();

      await database.write(async () => {
        const now = Date.now();
        await ordersCollection.create((order) => {
          order.status = orderData.status;
          order.tableId = orderData.tableId;
          order.guestId = orderData.guestId;
          order.itemsJson = orderData.itemsJson;
          order.openedAt = now;
          order.subtotalCents = orderData.subtotalCents;
          order.discountCents = orderData.discountCents;
          order.taxCents = orderData.taxCents;
          order.troncCents = orderData.troncCents;
          order.totalCents = orderData.totalCents;
          order.createdByEventId = "";
          order.updatedByEventId = "";
        });
      });
    } catch (error) {
      console.error("Error creating order:", error);
    }
  };

  const formatDate = (timestamp: number | undefined): string => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  };

  const formatCurrency = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getStatusColor = (status: OrderStatus): string => {
    switch (status) {
      case "open":
        return "#4CAF50";
      case "closed":
        return "#2196F3";
      case "voided":
        return "#F44336";
      default:
        return "#757575";
    }
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    let items: any[] = [];
    try {
      items = JSON.parse(item.itemsJson);
    } catch (e) {
      // Invalid JSON, ignore
    }

    return (
      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View style={styles.orderHeaderLeft}>
            <Text style={styles.orderId}>Order #{item.id.slice(-8)}</Text>
            {item.tableId && (
              <Text style={styles.orderTable}>Table: {item.tableId}</Text>
            )}
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          >
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.orderDetails}>
          {item.guestId && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Guest ID:</Text>
              <Text style={styles.detailValue}>{item.guestId}</Text>
            </View>
          )}
          {item.reservationId && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reservation ID:</Text>
              <Text style={styles.detailValue}>{item.reservationId}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Opened At:</Text>
            <Text style={styles.detailValue}>{formatDate(item.openedAt)}</Text>
          </View>
          {item.closedAt && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Closed At:</Text>
              <Text style={styles.detailValue}>
                {formatDate(item.closedAt)}
              </Text>
            </View>
          )}
          {item.voidedAt && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Voided At:</Text>
              <Text style={styles.detailValue}>
                {formatDate(item.voidedAt)}
              </Text>
            </View>
          )}

          <View style={styles.financialSection}>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Subtotal:</Text>
              <Text style={styles.financialValue}>
                {formatCurrency(item.subtotalCents)}
              </Text>
            </View>
            {item.discountCents > 0 && (
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Discount:</Text>
                <Text style={[styles.financialValue, styles.discountValue]}>
                  -{formatCurrency(item.discountCents)}
                </Text>
              </View>
            )}
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Tax:</Text>
              <Text style={styles.financialValue}>
                {formatCurrency(item.taxCents)}
              </Text>
            </View>
            {item.troncCents > 0 && (
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Tronc:</Text>
                <Text style={styles.financialValue}>
                  {formatCurrency(item.troncCents)}
                </Text>
              </View>
            )}
            <View style={[styles.financialRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total:</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(item.totalCents)}
              </Text>
            </View>
          </View>

          {items.length > 0 && (
            <View style={styles.itemsContainer}>
              <Text style={styles.itemsLabel}>Items ({items.length}):</Text>
              {items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <Text style={styles.itemName}>
                    {item.name || `Item ${index + 1}`}
                  </Text>
                  {item.quantity && (
                    <Text style={styles.itemQuantity}>x{item.quantity}</Text>
                  )}
                  {item.price && (
                    <Text style={styles.itemPrice}>
                      {formatCurrency(item.price * 100)}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          <View style={styles.metaSection}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Created By Event:</Text>
              <Text style={styles.detailValue}>
                {item.createdByEventId.slice(-8)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Updated By Event:</Text>
              <Text style={styles.detailValue}>
                {item.updatedByEventId.slice(-8)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Created At:</Text>
              <Text style={styles.detailValue}>
                {formatDate(item.createdAt)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Updated At:</Text>
              <Text style={styles.detailValue}>
                {formatDate(item.updatedAt)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading orders...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Orders</Text>
            <Text style={styles.headerSubtitle}>
              {orders.length} order{orders.length !== 1 ? "s" : ""} found
            </Text>
          </View>
          <TouchableOpacity
            style={styles.createButton}
            onPress={createOrder}
            activeOpacity={0.7}
          >
            <Text style={styles.createButtonText}>+ Create</Text>
          </TouchableOpacity>
        </View>
      </View>
      {orders.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No orders found</Text>
          <Text style={styles.emptySubtext}>
            Orders will appear here when they are created
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    padding: 20,
  },
  header: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#E3F2FD",
    opacity: 0.9,
  },
  createButton: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  createButtonText: {
    color: "#2196F3",
    fontSize: 15,
    fontWeight: "600",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: "#757575",
  },
  emptyText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#757575",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9E9E9E",
    textAlign: "center",
    lineHeight: 20,
  },
  listContent: {
    padding: 12,
    paddingBottom: 20,
  },
  orderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  orderHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#212121",
    marginBottom: 4,
  },
  orderTable: {
    fontSize: 12,
    color: "#757575",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  orderDetails: {
    gap: 10,
    width: "100%",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#757575",
    marginRight: 8,
    minWidth: 110,
  },
  detailValue: {
    fontSize: 13,
    color: "#212121",
    flex: 1,
    lineHeight: 18,
    flexShrink: 1,
  },
  financialSection: {
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    backgroundColor: "#F9F9F9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  financialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  financialLabel: {
    fontSize: 13,
    color: "#757575",
    fontWeight: "500",
  },
  financialValue: {
    fontSize: 13,
    color: "#212121",
    fontWeight: "500",
  },
  discountValue: {
    color: "#4CAF50",
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#212121",
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#2196F3",
  },
  itemsContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#F9F9F9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  itemsLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#757575",
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingLeft: 8,
  },
  itemName: {
    fontSize: 13,
    color: "#212121",
    flex: 1,
  },
  itemQuantity: {
    fontSize: 12,
    color: "#757575",
    marginHorizontal: 8,
  },
  itemPrice: {
    fontSize: 13,
    color: "#212121",
    fontWeight: "500",
  },
  metaSection: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
});
