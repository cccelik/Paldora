import PaldoraKit
import SwiftUI

/// Figma 10.1 Report and 10.2 Report sent, as a sheet.
struct ReportCommentSheet: View {
    @State private var model: ReportCommentViewModel
    @Environment(\.dismiss) private var dismiss

    init(env: FeatureEnvironment, commentId: String) {
        _model = State(initialValue: ReportCommentViewModel(env: env, commentId: commentId))
    }

    var body: some View {
        VStack(spacing: 0) {
            PaldoraNavBar(title: "Report this comment", leading: .close { dismiss() })
                .padding(.horizontal, Theme.gutter).padding(.vertical, Theme.space2)
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.space4) {
                    if model.sent {
                        PaldoraStateView(icon: .check, tone: .success, title: "Thanks for telling us.", message: ReportCopy.received) {
                            PaldoraButton("Done", size: .medium, fullWidth: true) { dismiss() }.padding(.top, Theme.space3)
                        }
                        .accessibilityIdentifier("report-sent")
                    } else {
                        PaldoraScreenTitle(title: "Tell us", accent: "what's wrong.", subtitle: "They won't know who reported it.")
                        PaldoraListGroup {
                            PaldoraChoiceRow(title: "Reason", icon: .flag,
                                             options: [.init(ReportCategory?.none, "Choose a reason")]
                                                 + ReportCategory.allCases.map { .init(Optional($0), ReportCopy.label($0)) },
                                             selection: $model.category)
                                .accessibilityIdentifier("report-category")
                        }
                        PaldoraFieldContainer(title: "Anything we should know? · optional") {
                            TextField("What happened?", text: $model.detail, prompt: Text("What happened?").foregroundStyle(Theme.textTertiary), axis: .vertical).lineLimit(3...8)
                                .padding(.vertical, Theme.space3).accessibilityIdentifier("report-detail")
                        }
                        Text("\(model.detail.count) of \(ReportCommentViewModel.detailLimit)").paldoraText(.caption)
                            .foregroundStyle(model.detail.count > ReportCommentViewModel.detailLimit ? Theme.statusDanger : Theme.textSecondary)
                        if let error = model.error { PaldoraBanner(tone: .danger, title: error) }
                        PaldoraButton("Send report", kind: .danger, isLoading: model.isSending, fullWidth: true) { Task { await model.send() } }
                            .disabled(!model.canSend).accessibilityIdentifier("send-report")
                        Text("Reporting does not automatically remove content.").paldoraText(.caption).foregroundStyle(Theme.textSecondary)
                    }
                }
                .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                .padding(Theme.space5)
                .frame(maxWidth: .infinity)
            }
        }
        .paldoraCanvas()
    }
}

/// Figma 10.3 Your reports.
struct MyReportsView: View {
    @State private var list: PagedList<ReportReceipt>

    init(env: FeatureEnvironment) { _list = State(initialValue: makeMyReports(env: env)) }

    var body: some View {
        Group {
            switch list.phase {
            case .idle, .loading: ScrollView { LoadingBlock(label: "Loading your reports", compact: true).padding(Theme.gutter) }
            case .failed(let message): ErrorBlock(message: message) { await list.refresh() }
            case .unavailable: UnavailableBlock()
            case .loaded:
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: Theme.space3) {
                        PaldoraScreenTitle(title: "Reports",
                                           subtitle: "Only you and the moderation team can see these receipts. Reporting does not automatically remove content.")
                        if list.items.isEmpty {
                            EmptyBlock(title: "No reports", message: "You have not submitted a report.", icon: .flag)
                                .accessibilityIdentifier("no-reports")
                        }
                        ForEach(list.items) { report in
                            PaldoraPersonRow(
                                name: ReportCopy.kind(report.targetKind),
                                subtitle: "\(ReportCopy.categoryLabel(report.category)) · \(report.createdAt.date.formatted(date: .abbreviated, time: .omitted))") {
                                PaldoraChip(title: report.status == "closed" ? "Reviewed" : "Received",
                                            style: report.status == "closed" ? .brass : .soft)
                            }
                            .accessibilityElement(children: .combine).accessibilityIdentifier("report-receipt")
                        }
                        LoadMoreFooter(isLoading: list.isLoadingMore, error: list.inlineError, hasMore: list.hasMore,
                                       loadMore: { await list.loadMore() })
                        Text("Statuses are kept coarse on purpose. We never share what happened to another person's account.")
                            .paldoraText(.caption).foregroundStyle(Theme.textSecondary)
                    }
                    .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                    .padding(.horizontal, Theme.gutter)
                    .frame(maxWidth: .infinity)
                }
                .refreshable { await list.refresh() }
            }
        }
        .paldoraCanvas()
        .paldoraNavBar("Your reports", showsTitle: false)
        .task { await list.refresh() }
    }
}

/// Figma 9.5 Content notices (what moderation hid from you).
struct NoticesView: View {
    @State private var list: PagedList<ModerationNotice>

    init(env: FeatureEnvironment) { _list = State(initialValue: makeNotices(env: env)) }

    var body: some View {
        Group {
            switch list.phase {
            case .idle, .loading: ScrollView { LoadingBlock(label: "Loading notices", compact: true).padding(Theme.gutter) }
            case .failed(let message): ErrorBlock(message: message) { await list.refresh() }
            case .unavailable: UnavailableBlock()
            case .loaded:
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: Theme.space3) {
                        PaldoraScreenTitle(title: "Content notices",
                                           subtitle: "If a post or comment you made is hidden by moderation, it appears here. Other members cannot see the hidden content. If you think a decision is mistaken, contact the person who invited you to request a review.")
                        if list.items.isEmpty {
                            EmptyBlock(title: "No content notices", message: "Nothing of yours has been hidden.", icon: .info)
                                .accessibilityIdentifier("no-notices")
                        }
                        ForEach(list.items) { item in
                            PaldoraBanner(tone: .warning, title: "Your \(item.targetKind) was hidden by moderation.",
                                          message: "Reference ID: \(item.targetId) · Originally shared \(item.originalCreatedAt.date.formatted(date: .abbreviated, time: .omitted))")
                        }
                    }
                    .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                    .padding(.horizontal, Theme.gutter)
                    .frame(maxWidth: .infinity)
                }
                .refreshable { await list.refresh() }
            }
        }
        .paldoraCanvas()
        .paldoraNavBar("Content notices", showsTitle: false)
        .task { await list.refresh() }
    }
}
