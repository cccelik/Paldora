import PaldoraKit
import SwiftUI

struct ReportCommentSheet: View {
    @State private var model: ReportCommentViewModel
    @Environment(\.dismiss) private var dismiss

    init(env: FeatureEnvironment, commentId: String) {
        _model = State(initialValue: ReportCommentViewModel(env: env, commentId: commentId))
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Theme.space4) {
                if model.sent {
                    InlineMessage(text: ReportCopy.received, kind: .success).accessibilityIdentifier("report-sent")
                } else {
                    Picker("Reason", selection: $model.category) {
                        Text("Choose a reason").tag(ReportCategory?.none)
                        ForEach(ReportCategory.allCases, id: \.self) { Text(ReportCopy.label($0)).tag(Optional($0)) }
                    }
                    .pickerStyle(.menu).frame(minHeight: Theme.touchTarget).accessibilityIdentifier("report-category")
                    FieldContainer(title: "More information (optional)") {
                        TextField("What happened?", text: $model.detail, axis: .vertical).lineLimit(3...8)
                            .padding(.vertical, Theme.space2).accessibilityIdentifier("report-detail")
                    }
                    Text("\(model.detail.count) of \(ReportCommentViewModel.detailLimit)").font(Typography.caption)
                        .foregroundStyle(model.detail.count > ReportCommentViewModel.detailLimit ? Theme.danger : Theme.textMuted)
                    if let error = model.error { InlineMessage(text: error) }
                    Button { Task { await model.send() } } label: {
                        if model.isSending { ProgressView() } else { Text("Send report") }
                    }
                    .buttonStyle(PrimaryButtonStyle()).disabled(!model.canSend).accessibilityIdentifier("send-report")
                    Text("Reporting does not automatically remove content.").font(Typography.caption).foregroundStyle(Theme.textMuted)
                }
                Spacer()
            }
            .padding(Theme.space6)
            .background(Theme.canvas)
            .navigationTitle("Report this comment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(model.sent ? "Done" : "Cancel") { dismiss() } } }
        }
    }
}

struct MyReportsView: View {
    @State private var list: PagedList<ReportReceipt>

    init(env: FeatureEnvironment) { _list = State(initialValue: makeMyReports(env: env)) }

    var body: some View {
        Group {
            switch list.phase {
            case .idle, .loading: LoadingBlock(label: "Loading your reports")
            case .failed(let message): ErrorBlock(message: message) { await list.refresh() }
            case .unavailable: UnavailableBlock()
            case .loaded:
                List {
                    Text("Only you and the moderation team can see these receipts. Reporting does not automatically remove content.")
                        .font(Typography.callout).foregroundStyle(Theme.textMuted).listRowBackground(Theme.canvas)
                    if list.items.isEmpty {
                        Text("You have not submitted a report.").font(Typography.body).listRowBackground(Theme.canvas)
                            .accessibilityIdentifier("no-reports")
                    }
                    ForEach(list.items) { report in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ReportCopy.kind(report.targetKind)).font(Typography.headline)
                            Text("\(ReportCopy.categoryLabel(report.category)) · \(report.status == "closed" ? "Reviewed" : "Received") · \(report.createdAt.date.formatted(date: .abbreviated, time: .omitted))")
                                .font(Typography.caption).foregroundStyle(Theme.textMuted)
                        }
                        .accessibilityElement(children: .combine).accessibilityIdentifier("report-receipt")
                        .listRowBackground(Theme.surface)
                    }
                    LoadMoreFooter(isLoading: list.isLoadingMore, error: list.inlineError, hasMore: list.hasMore,
                                   loadMore: { await list.loadMore() }).listRowBackground(Theme.canvas)
                }
                .scrollContentBackground(.hidden).refreshable { await list.refresh() }
            }
        }
        .background(Theme.canvas)
        .navigationTitle("Your reports")
        .navigationBarTitleDisplayMode(.inline)
        .task { await list.refresh() }
    }
}

struct NoticesView: View {
    @State private var list: PagedList<ModerationNotice>

    init(env: FeatureEnvironment) { _list = State(initialValue: makeNotices(env: env)) }

    var body: some View {
        Group {
            switch list.phase {
            case .idle, .loading: LoadingBlock(label: "Loading notices")
            case .failed(let message): ErrorBlock(message: message) { await list.refresh() }
            case .unavailable: UnavailableBlock()
            case .loaded:
                List {
                    Text("If a post or comment you made is hidden by moderation, it appears here. Other members cannot see the hidden content. If you think a decision is mistaken, contact the person who invited you to request a review.")
                        .font(Typography.callout).foregroundStyle(Theme.textMuted).listRowBackground(Theme.canvas)
                    if list.items.isEmpty {
                        Text("No content notices.").font(Typography.body).listRowBackground(Theme.canvas)
                            .accessibilityIdentifier("no-notices")
                    }
                    ForEach(list.items) { item in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Your \(item.targetKind) was hidden by moderation.").font(Typography.headline)
                            Text("Reference ID: \(item.targetId)").font(Typography.caption).foregroundStyle(Theme.textMuted)
                            Text("Originally shared \(item.originalCreatedAt.date.formatted(date: .abbreviated, time: .omitted))")
                                .font(Typography.caption).foregroundStyle(Theme.textMuted)
                        }
                        .accessibilityElement(children: .combine).listRowBackground(Theme.surface)
                    }
                }
                .scrollContentBackground(.hidden).refreshable { await list.refresh() }
            }
        }
        .background(Theme.canvas)
        .navigationTitle("Content notices")
        .navigationBarTitleDisplayMode(.inline)
        .task { await list.refresh() }
    }
}
