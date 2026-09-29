import CoreImage.CIFilterBuiltins
import ExpoModulesCore
import SwiftUI

public class ParityUIModule: Module {
  private let ciContext = CIContext()

  public func definition() -> ModuleDefinition {
    Name("ParityUI")
    Function("qrMatrix") { (content: String) -> [[Int]]? in
      guard let data = content.data(using: .ascii) else { return nil }
      let filter = CIFilter.qrCodeGenerator()
      filter.setValue(data, forKey: "inputMessage")
      filter.setValue("H", forKey: "inputCorrectionLevel")
      guard let output = filter.outputImage,
            let image = self.ciContext.createCGImage(output, from: output.extent),
            let data = image.dataProvider?.data,
            let bytes = CFDataGetBytePtr(data) else { return nil }
      let stride = image.bitsPerPixel / 8
      return (0..<image.height).map { row in
        (0..<image.width).map { column in
          bytes[row * image.bytesPerRow + column * stride] == 0 ? 1 : 0
        }
      }
    }
    View(OnboardingBackdropView.self) {}
    View(OnboardingCopyView.self) {
      Prop("items") { (view, items: [[String: String]]) in view.model.items = items }
      Prop("index") { (view, index: Int) in view.model.index = index }
      Prop("reducedMotion") { (view, reduced: Bool) in view.model.reducedMotion = reduced }
    }
    View(AppTabBarView.self) {
      Events("onSelectTab", "onToggleExpanded", "onAction")
      Prop("tabs") { (view, tabs: [[String: String]]) in
        view.model.tabs = tabs.map {
          TabBarItem(
            key: $0["key"] ?? "", title: $0["title"] ?? "", icon: $0["icon"] ?? "",
            selectedIcon: $0["selectedIcon"] ?? "")
        }
      }
      Prop("actions") { (view, actions: [[String: Any]]) in
        view.model.actions = actions.map {
          TabBarAction(
            id: $0["id"] as? String ?? "", title: $0["title"] as? String ?? "",
            symbol: $0["symbol"] as? String ?? "", pro: $0["pro"] as? Bool ?? false)
        }
      }
      Prop("selectedIndex") { (view, index: Int) in
        if view.model.selectedIndex != index { view.model.selectedIndex = index }
      }
      Prop("expanded") { (view, expanded: Bool) in view.setExpanded(expanded) }
      Prop("bottomPadding") { (view, padding: Double) in view.model.bottomPadding = padding }
      Prop("showsFab") { (view, shows: Bool) in view.model.showsFab = shows }
    }
  }
}

final class CopyModel: ObservableObject {
  @Published var items: [[String: String]] = []
  @Published var index = 0
  @Published var reducedMotion = false
}

// TextContentView from OnboardingView.swift, with translated data supplied by RN.
// SwiftUI owns system text metrics, blur, paging and the source spring together.
private struct OnboardingCopy: View {
  @ObservedObject var model: CopyModel
  private var transitionAnimation: Animation {
    if #available(iOS 17.0, *) {
      return .interpolatingSpring(duration: 0.65, bounce: 0, initialVelocity: 0)
    }
    return .interpolatingSpring(stiffness: 180, damping: 26)
  }
  var body: some View {
    GeometryReader { geometry in
      HStack(spacing: 0) {
        ForEach(model.items.indices, id: \.self) { index in
          let item = model.items[index]
          VStack(spacing: 6) {
            Text(item["title"] ?? "")
              .font(.title2).fontWeight(.semibold).lineLimit(1).foregroundStyle(.white)
            Text(item["subtitle"] ?? "")
              .font(.callout).lineLimit(2).multilineTextAlignment(.center)
              .foregroundStyle(.white.opacity(0.8))
          }
          .frame(width: geometry.size.width)
          .compositingGroup()
          .blur(radius: model.index == index || model.reducedMotion ? 0 : 30)
          .opacity(model.index == index ? 1 : 0)
          .accessibilityHidden(model.index != index)
        }
      }
      .offset(x: -CGFloat(model.index) * geometry.size.width)
      .animation(model.reducedMotion ? nil : transitionAnimation, value: model.index)
    }
    .environment(\.colorScheme, .dark)
  }
}

final class OnboardingCopyView: ExpoView {
  let model = CopyModel()
  private var controller: UIHostingController<OnboardingCopy>!

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    controller = UIHostingController(rootView: OnboardingCopy(model: model))
    controller.view.backgroundColor = .clear
    clipsToBounds = false
    addSubview(controller.view)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    controller.view.frame = bounds
  }
}

// VariableGlassBlur(15) from the pinned OnboardingView, including the pre-iOS-26 path.
private struct OnboardingBackdrop: View {
  @ViewBuilder private var material: some View {
    if #available(iOS 26.0, *) {
      Rectangle().fill(Color.black.opacity(0.5)).glassEffect(.clear, in: .rect)
    } else {
      Rectangle().fill(Color.black.opacity(0.5))
    }
  }
  var body: some View {
    material.blur(radius: 15)
      .padding(.horizontal, -30).padding(.bottom, -30).padding(.top, -7.5)
      .ignoresSafeArea().allowsHitTesting(false).accessibilityHidden(true)
  }
}

final class OnboardingBackdropView: ExpoView {
  private let controller = UIHostingController(rootView: OnboardingBackdrop())
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    controller.view.backgroundColor = .clear
    controller.view.isUserInteractionEnabled = false
    clipsToBounds = false
    addSubview(controller.view)
  }
  override func layoutSubviews() {
    super.layoutSubviews()
    controller.view.frame = bounds
  }
}
