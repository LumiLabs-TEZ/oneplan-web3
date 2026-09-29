import ExpoModulesCore
import SwiftUI
import UIKit

// Tab bar + FAB + quick-action card from `MainView.swift:166-192` / `:775-823`, with
// `MorphingTabBar.swift`, `ExpandableGlassEffect.swift` and the glass helpers of
// `LiquidGlassCompat.swift` ported verbatim. RN supplies translated titles and routes the
// events; SwiftUI owns the segmented-control glass lens and the morph spring together.

private enum TabBarColors {
  static let blueBase = Color(red: 0.2, green: 0.36, blue: 1)
  static let contentL = Color(UIColor(red: 0.78, green: 0.78, blue: 0.78, alpha: 1))
  static let surface = Color(UIColor(red: 1, green: 1, blue: 1, alpha: 1))
}

/// `.bouncy(duration: 0.5, extraBounce: 0.05)` — the FAB/row toggle animation in `MainView`.
private var morphAnimation: Animation {
  if #available(iOS 17.0, *) {
    return .bouncy(duration: 0.5, extraBounce: 0.05)
  }
  return .spring(response: 0.5, dampingFraction: 0.65)
}

struct TabBarItem: Equatable {
  var key: String
  var title: String
  var icon: String
  var selectedIcon: String
}

struct TabBarAction: Equatable {
  var id: String
  var title: String
  var symbol: String
  var pro: Bool
}

final class TabBarModel: ObservableObject {
  @Published var tabs: [TabBarItem] = []
  @Published var actions: [TabBarAction] = []
  @Published var selectedIndex = 0
  @Published var expanded = false
  @Published var bottomPadding: CGFloat = 25
  /// `false` for secondary bars (TripEnd History / Breakdown): no FAB, compact centred pill.
  @Published var showsFab = true
  @Published var selectedActionIndex: Int?
  /// Frames (root coordinate space) that accept touches; everything else passes through to RN.
  var interactiveFrames: [String: CGRect] = [:]

  var onSelectTab: ((Int) -> Void)?
  var onToggleExpanded: ((Bool) -> Void)?
  var onAction: ((String) -> Void)?
}

// MARK: - Root

private struct AppTabBarRoot: View {
  @ObservedObject var model: TabBarModel

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      HStack(alignment: .bottom, spacing: 12) {
        MorphingTabBar(
          tabs: model.tabs,
          activeIndex: Binding(
            get: { model.selectedIndex },
            set: { index in
              guard index != model.selectedIndex else { return }
              model.selectedIndex = index
              model.onSelectTab?(index)
            }
          ),
          isExpanded: model.expanded
        ) {
          expandedContent
        }
        .frame(width: model.showsFab ? nil : compactBarWidth)
        .background(frameReader("bar"))

        if model.showsFab {
          fab
        }
      }
      .padding(.horizontal, 20)
      .padding(.bottom, model.bottomPadding)
    }
    // Fill the host view so `tabBarRoot` shares its origin with `hitTest`'s point. Without it
    // the compact (no-FAB) bar shrinks the stack, which is then centred, and the recorded
    // frames sit left of the drawn pill.
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .coordinateSpace(name: "tabBarRoot")
  }

  /// No-FAB bar: equal segments wide enough for the longest (translated) title plus the
  /// selection lens's side room, never narrower than 96pt.
  private var compactBarWidth: CGFloat {
    let font = UIFont(name: "BeVietnamPro-Regular", size: 13) ?? .systemFont(ofSize: 13)
    let longest = model.tabs.map { ($0.title as NSString).size(withAttributes: [.font: font]).width }
      .max() ?? 0
    let segment = max(96, ceil(longest) + 36)
    return CGFloat(model.tabs.count) * segment + 4
  }

  private var fab: some View {
    Button {
      UIImpactFeedbackGenerator(style: .light).impactOccurred()
      withAnimation(morphAnimation) {
        model.expanded.toggle()
      }
      model.onToggleExpanded?(model.expanded)
    } label: {
      Image(systemName: "plus")
        .font(.system(size: 26, weight: .medium))
        .rotationEffect(.init(degrees: model.expanded ? 45 : 0))
        .frame(width: 58, height: 58)
        .foregroundStyle(Color.primary)
        .contentShape(Circle())
    }
    .buttonStyle(PlainGlassButtonEffect(shape: Circle()))
    .accessibilityIdentifier("fab")
    .accessibilityLabel("Quick actions")
    .background(frameReader("fab"))
  }

  private func frameReader(_ key: String) -> some View {
    GeometryReader { proxy in
      Color.clear.onAppear { model.interactiveFrames[key] = proxy.frame(in: .named("tabBarRoot")) }
        .onChange(of: proxy.frame(in: .named("tabBarRoot"))) { frame in
          model.interactiveFrames[key] = frame
        }
    }
  }

  private var expandedContent: some View {
    VStack(spacing: 0) {
      ForEach(Array(model.actions.enumerated()), id: \.element.id) { index, action in
        Button {
          model.selectedActionIndex = index
          withAnimation(morphAnimation) {
            model.expanded = false
          }
          model.onToggleExpanded?(false)
          model.onAction?(action.id)
        } label: {
          HStack(spacing: 16) {
            Image(systemName: action.symbol)
              .font(.system(size: 20))
              .frame(width: 28)
              .foregroundStyle(Color.primary)

            Text(action.title)
              .font(.system(size: 16, weight: .medium))
              .foregroundStyle(Color.primary)
              .frame(maxWidth: .infinity, alignment: .leading)

            if action.pro {
              ProBadge()
                .fixedSize()
            }
          }
          .padding(.horizontal, 20)
          .padding(.vertical, 14)
          .background(
            Capsule().fill(
              model.selectedActionIndex == index ? Color.gray.opacity(0.06) : Color.clear
            )
          )
          .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("quick-\(action.id)")
      }
    }
    .padding(8)
  }
}

private struct PlainGlassButtonEffect<S: Shape>: ButtonStyle {
  var shape: S
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .glassEffectCompat(in: shape)
  }
}

private struct ProBadge: View {
  var body: some View {
    Text("Pro")
      .font(Font.custom("BeVietnamPro-Regular", size: 13))
      .tracking(-0.52)
      .foregroundStyle(TabBarColors.blueBase)
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .overlay {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .stroke(TabBarColors.blueBase, lineWidth: 1)
      }
  }
}

// MARK: - MorphingTabBar

private struct MorphingTabBar<ExpandedContent: View>: View {
  var tabs: [TabBarItem]
  @Binding var activeIndex: Int
  var isExpanded: Bool
  @ViewBuilder var expandedContent: ExpandedContent
  @State private var viewWidth: CGFloat?

  var body: some View {
    ZStack {
      if let viewWidth, !tabs.isEmpty {
        let progress: CGFloat = isExpanded ? 1 : 0
        let labelSize = CGSize(width: viewWidth, height: 58)
        let cornerRadius: CGFloat = labelSize.height / 2

        ExpandableGlassEffect(
          alignment: .center, progress: progress, labelSize: labelSize,
          cornerRadius: cornerRadius
        ) {
          expandedContent
        } label: {
          SegmentedTabBar(tabs: tabs, index: $activeIndex)
            .frame(height: 54)
            .padding(.horizontal, 2)
            .offset(y: -0.7)
        }
      }
    }
    .frame(maxWidth: .infinity)
    .onGeometryChange(for: CGFloat.self) {
      $0.size.width
    } action: { newValue in
      viewWidth = newValue
    }
    .frame(height: viewWidth == nil ? 58 : nil)
  }
}

private struct SegmentedTabBar: UIViewRepresentable {
  var tint: Color = .gray.opacity(0.15)
  var tabs: [TabBarItem]
  @Binding var index: Int

  func makeUIView(context: Context) -> IdentifiedSegmentedControl {
    let control = IdentifiedSegmentedControl(items: tabs.map(\.icon))
    control.selectedSegmentIndex = index
    control.selectedSegmentTintColor = UIColor(tint)
    control.segmentIdentifiers = tabs.map { "tab-\($0.key)" }
    updateImages(for: control, selectedIndex: index)
    context.coordinator.renderedIndex = index
    context.coordinator.renderedTabs = tabs

    control.addTarget(
      context.coordinator, action: #selector(context.coordinator.didSelect(_:)),
      for: .valueChanged)

    if #available(iOS 26, *) {
      // iOS 26: keep the system Liquid Glass appearance + tab-switch animation. Setting
      // custom background images opts the control OUT of the system glass rendering, so
      // instead just fade the default background image views. On iOS 26 the per-segment
      // icons live deeper in the hierarchy, so `dropLast()` leaves them visible.
      DispatchQueue.main.async {
        for view in control.subviews.dropLast() where view is UIImageView {
          view.alpha = 0
        }
      }
    } else {
      // Below iOS 26 the `subviews.dropLast()` hack hides the segment icons (flatter
      // internal hierarchy), so use documented transparency APIs instead.
      control.backgroundColor = .clear
      let transparent = UIImage()
      control.setBackgroundImage(transparent, for: .normal, barMetrics: .default)
      control.setBackgroundImage(transparent, for: .highlighted, barMetrics: .default)
      control.setDividerImage(
        transparent,
        forLeftSegmentState: .normal,
        rightSegmentState: .normal,
        barMetrics: .default
      )
    }

    return control
  }

  func updateUIView(_ uiView: IdentifiedSegmentedControl, context: Context) {
    // Keep the coordinator's binding current — the struct is a value copy.
    context.coordinator.parent = self

    if uiView.selectedSegmentIndex != index {
      uiView.selectedSegmentIndex = index
    }
    // `updateUIView` runs every frame while the enclosing Animatable glass morph animates;
    // re-rendering the composite images each frame stalls the main thread and drops
    // touches. Only re-render when the selection or the (translated) tabs change.
    if context.coordinator.renderedIndex != index || context.coordinator.renderedTabs != tabs {
      uiView.segmentIdentifiers = tabs.map { "tab-\($0.key)" }
      updateImages(for: uiView, selectedIndex: index)
      context.coordinator.renderedIndex = index
      context.coordinator.renderedTabs = tabs
    }
  }

  private func updateImages(for control: UISegmentedControl, selectedIndex: Int) {
    for (i, tab) in tabs.enumerated() where i < control.numberOfSegments {
      let isSelected = i == selectedIndex
      let iconName = isSelected ? tab.selectedIcon : tab.icon
      let color = isSelected ? UIColor(TabBarColors.blueBase) : UIColor(TabBarColors.contentL)
      let targetIconHeight: CGFloat = 26

      guard let icon = resolvedIcon(named: iconName, color: color) else { continue }

      let font = UIFont(name: "BeVietnamPro-Regular", size: 13) ?? .systemFont(ofSize: 13)
      let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
      let textSize = (tab.title as NSString).size(withAttributes: attrs)
      let iconScale = targetIconHeight / max(icon.size.height, 1)
      let iconSize = CGSize(width: icon.size.width * iconScale, height: targetIconHeight)
      let spacing: CGFloat = 6
      let compositeWidth = max(iconSize.width, textSize.width, 54)
      let compositeHeight = iconSize.height + spacing + textSize.height
      let compositeSize = CGSize(width: compositeWidth, height: compositeHeight)

      let renderer = UIGraphicsImageRenderer(size: compositeSize)
      let composite = renderer.image { _ in
        let iconX = (compositeWidth - iconSize.width) / 2
        icon.draw(in: CGRect(origin: CGPoint(x: iconX, y: 0), size: iconSize))

        let textX = (compositeWidth - textSize.width) / 2
        (tab.title as NSString).draw(
          at: CGPoint(x: textX, y: iconSize.height + spacing), withAttributes: attrs)
      }

      let image = composite.withRenderingMode(.alwaysOriginal)
      image.accessibilityLabel = tab.title
      control.setImage(image, forSegmentAt: i)
    }
  }

  private func resolvedIcon(named name: String, color: UIColor) -> UIImage? {
    if let assetIcon = UIImage(named: name, in: TabBarAssets.bundle, compatibleWith: nil) {
      return assetIcon.withRenderingMode(.alwaysOriginal)
    }
    let configuration = UIImage.SymbolConfiguration(pointSize: 23, weight: .medium)
    guard let symbol = UIImage(systemName: name, withConfiguration: configuration) else {
      return nil
    }
    return symbol.withTintColor(color, renderingMode: .alwaysOriginal)
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(parent: self)
  }

  final class Coordinator: NSObject {
    var parent: SegmentedTabBar
    var renderedIndex: Int?
    var renderedTabs: [TabBarItem] = []
    private let selectionFeedbackGenerator = UISelectionFeedbackGenerator()

    init(parent: SegmentedTabBar) {
      self.parent = parent
      selectionFeedbackGenerator.prepare()
    }

    @objc
    func didSelect(_ control: UISegmentedControl) {
      selectionFeedbackGenerator.selectionChanged()
      selectionFeedbackGenerator.prepare()
      parent.index = control.selectedSegmentIndex
    }
  }

  func sizeThatFits(
    _ proposal: ProposedViewSize, uiView: IdentifiedSegmentedControl, context: Context
  ) -> CGSize? {
    proposal.replacingUnspecifiedDimensions()
  }
}

/// Tags each segment's accessibility element with `tab-<key>` so the Maestro flows keep
/// addressing tabs by id (the RN bar exposed `testID="tab-<key>"`).
final class IdentifiedSegmentedControl: UISegmentedControl {
  var segmentIdentifiers: [String] = [] {
    didSet { setNeedsLayout() }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let segments = subviews
      .filter { String(describing: type(of: $0)).contains("Segment") && $0.bounds.width > 0 }
      .sorted { $0.frame.minX < $1.frame.minX }
    guard segments.count == segmentIdentifiers.count else { return }
    for (segment, identifier) in zip(segments, segmentIdentifiers) {
      segment.accessibilityIdentifier = identifier
    }
  }
}

private enum TabBarAssets {
  static let bundle: Bundle? = {
    let candidates = [Bundle.main, Bundle(for: TabBarModel.self)]
    for candidate in candidates {
      if let url = candidate.url(forResource: "ParityUIAssets", withExtension: "bundle"),
        let bundle = Bundle(url: url)
      {
        return bundle
      }
    }
    return nil
  }()
}

// MARK: - ExpandableGlassEffect

private struct ExpandableGlassEffect<Content: View, Label: View>: View, Animatable {
  var alignment: Alignment
  var progress: CGFloat
  var labelSize: CGSize = .init(width: 55, height: 55)
  var cornerRadius: CGFloat = 30
  @ViewBuilder var content: Content
  @ViewBuilder var label: Label
  @State private var contentSize: CGSize = .zero

  var animatableData: CGFloat {
    get { progress }
    set { progress = newValue }
  }

  var body: some View {
    GlassContainerCompat {
      glassCard
    }
    .scaleEffect(
      x: 1 - (blurProgress * 0.5),
      y: 1 + (blurProgress * 0.35),
      anchor: scaleAnchor
    )
    .offset(y: offset * blurProgress)
  }

  @ViewBuilder
  private var glassCard: some View {
    let widthDiff = contentSize.width - labelSize.width
    let heightDiff = contentSize.height - labelSize.height

    let rWidth = widthDiff * contentOpacity
    let rHeight = heightDiff * contentOpacity

    ZStack(alignment: alignment) {
      content
        .compositingGroup()
        .scaleEffect(contentScale)
        .blur(radius: 14 * blurProgress)
        .opacity(contentOpacity)
        .onGeometryChange(for: CGSize.self) {
          $0.size
        } action: { newValue in
          contentSize = newValue
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(
          width: labelSize.width + rWidth,
          height: labelSize.height + rHeight
        )
        // Opacity 0 does NOT disable hit testing — without this the invisible expanded
        // content competes for touches while collapsed.
        .allowsHitTesting(progress > 0.95)
        .accessibilityHidden(progress < 0.95)

      label
        .compositingGroup()
        .blur(radius: 14 * blurProgress)
        .opacity(1 - labelOpacity)
        .frame(width: labelSize.width, height: labelSize.height)
        // The label is a UIViewRepresentable on top of the ZStack; its UIKit view keeps
        // receiving touches even at opacity 0, stealing taps from the expanded content.
        .allowsHitTesting(progress < 0.05)
        .accessibilityHidden(progress > 0.05)
    }
    .compositingGroup()
    .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    // Non-interactive: `.interactive()` glass adds its own touch response on iOS 26,
    // which competes with the UISegmentedControl's touch tracking.
    .glassEffectCompat(in: RoundedRectangle(cornerRadius: cornerRadius), interactive: false)
  }

  var labelOpacity: CGFloat {
    min(progress / 0.35, 1)
  }

  var contentOpacity: CGFloat {
    max(progress - 0.35, 0) / 0.65
  }

  var contentScale: CGFloat {
    guard contentSize.width > 0, contentSize.height > 0 else { return 1 }
    let minAspectScale = min(
      labelSize.width / contentSize.width, labelSize.height / contentSize.height)
    return minAspectScale + (1 - minAspectScale) * progress
  }

  var blurProgress: CGFloat {
    progress > 0.5 ? (1 - progress) / 0.5 : progress / 0.5
  }

  var offset: CGFloat {
    switch alignment {
    case .bottom, .bottomLeading, .bottomTrailing: return -80
    case .top, .topLeading, .topTrailing: return 80
    default: return -10
    }
  }

  var scaleAnchor: UnitPoint {
    switch alignment {
    case .bottomLeading: .bottomLeading
    case .bottom: .bottom
    case .bottomTrailing: .bottomTrailing
    case .topLeading: .topLeading
    case .top: .top
    case .topTrailing: .topTrailing
    case .leading: .leading
    case .trailing: .trailing
    default: .center
    }
  }
}

// MARK: - LiquidGlassCompat (subset)

extension View {
  @ViewBuilder
  fileprivate func glassEffectCompat<S: Shape>(in shape: S, interactive: Bool = true) -> some View {
    if #available(iOS 26.0, *) {
      glassEffect(interactive ? Glass.regular.interactive() : Glass.regular, in: shape)
    } else {
      // Opaque surface + soft shadow + hairline rim (never shadow a Material — see
      // `LiquidGlassCompat.swift`).
      background {
        shape
          .fill(TabBarColors.surface)
          .shadow(color: .black.opacity(0.10), radius: 6, x: 0, y: 2)
          .overlay {
            shape.stroke(Color.primary.opacity(0.06), lineWidth: 0.5)
          }
      }
    }
  }
}

private struct GlassContainerCompat<Content: View>: View {
  @ViewBuilder var content: Content

  var body: some View {
    if #available(iOS 26.0, *) {
      GlassEffectContainer {
        content
      }
    } else {
      content
    }
  }
}

// MARK: - Expo view

final class AppTabBarView: ExpoView {
  let model = TabBarModel()
  let onSelectTab = EventDispatcher()
  let onToggleExpanded = EventDispatcher()
  let onAction = EventDispatcher()
  private var controller: UIHostingController<AppTabBarRoot>!

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    controller = UIHostingController(rootView: AppTabBarRoot(model: model))
    controller.view.backgroundColor = .clear
    // RN already pads for the home indicator (`bottomPadding`); don't let SwiftUI add more.
    controller.safeAreaRegions = []
    clipsToBounds = false
    addSubview(controller.view)

    model.onSelectTab = { [weak self] index in self?.onSelectTab(["index": index]) }
    model.onToggleExpanded = { [weak self] expanded in
      self?.onToggleExpanded(["expanded": expanded])
    }
    model.onAction = { [weak self] id in self?.onAction(["id": id]) }
  }

  func setExpanded(_ expanded: Bool) {
    guard model.expanded != expanded else { return }
    withAnimation(morphAnimation) {
      model.expanded = expanded
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    controller.view.frame = bounds
  }

  // The view is taller than the bar (room for the expanded card and the -80 morph lift);
  // only the bar/card and the FAB take touches, the rest falls through to the scene.
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let slop: CGFloat = 4
    let inside = model.interactiveFrames.values.contains {
      $0.insetBy(dx: -slop, dy: -slop).contains(point)
    }
    return inside ? super.hitTest(point, with: event) : nil
  }
}
