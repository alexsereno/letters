---
title: "Get Xcode Previews Working"
description: "A quick rundown on common Xcode Preview issues & resolution"
pubDate: "Apr 10 2024"
heroImage: "/images/defaultHero.jpg"
---

A quick rundown on common Xcode Preview issues & their resolution

### The Xcode Preview Environment & You

I sweat a lot of blood getting Previews working for [IronIQ](https://IronIQ.app).

Are you in a similar position? Setup is confusing, & you're scared?

Thankfully, it's not too hard to get a great preview environment up & running even for complex applications (SPM, multiple data stacks, etc.)

## An initial pitfall

#### SPM & Multiple Platforms?

If you get the error "when building for watchOS simulator, no library for this platform was found" or "when building f
or visionOS simulator, no library for this platform was found" the solution is stupid, & easy. Delete any existing scheme for the platform (watchOS & visionOS in my case), creating a new scheme for the platform, and uncheck everything on the main app. It'll look like this when done correctly:

![xcode schemes](https://developer.apple.com/forums/content/attachment/95a6a077-15f2-4c89-81a0-e028d13de2aa)

This keeps Xcode from polluting your previews for each target - you just have to switch targets before attempting to preview.

## Setting up a good Preview Environment

Previews run inside their own little in-memory bubble. Everything your view needs has to be in that bubble. Since its in-memory you don't want to load too much in, you need a lightweight sandbox to play in. This is where most people fail, since figuring out what each view (and its children) needs creates a ton of complexity for larger apps.

Thankfully, we can simplify this dramatically by making a few smart choices when we create dependencies.

#### Are you using @Environment or @EnvironmentObject?

All of those objects need to be in our preview's environment.

##### First, declare your objects with a preview singleton.

```swift
@Observable
class ExampleObject {
    var name: String?

    init(name: String) {
        self.name = name
    }
}

/// I like to only run this on simulators to not pollute prod.
#if targetEnvironment(simulator)
extension ExampleObject {
    static let preview = ExampleObject(name: "Alexander")
}
#endif
```

##### Then, add this to the preview's environment for any view with the dependency.

```swift
struct MyView: View {
    @Environment(ExampleObject.self) private var exampleObject
    var body: some View {
        Text("Hello, World!")
    }
}

#if targetEnvironment(simulator)
#Preview {
        MyView()
            .environment(ExampleObject.preview)
}
#endif
```

#### But my Preview Environment includes SwiftData, CoreData, & a lot more!

Declare a preview singleton for every one of them, then make a handy ViewModifier to attach to your previews.
Every preview that could have a subview depending on an object in the environment needs this modifier, so just toss it on everything.

```swift
struct PreviewEnvironment: ViewModifier {
    let localize: String

    func body(content: Content) -> some View {
        content
        #if targetEnvironment(simulator)
            // MARK: - iOS
        .environment(\.locale, .init(identifier: localize))

            #if os(iOS)

                // MARK: Preview Environment Variables

                .environment(ExampleObject.preview)
                .environment(ExampleObject2.preview)

                // MARK: Preview Environment Objects

                .environmentObject(ExampleObservableObject.preview)

                // MARK: Preview ModelContext

                .modelContainer(SDPreviewData.container)

                // MARK: Preview ManagedObjectContext

                .environment(\.managedObjectContext, PersistenceController.singleton.container.viewContext)

                // MARK: - watchOS

            #elseif os(watchOS)
                .environment(ExampleObject3.preview)

            #endif

        #endif
    }
}

extension View {
    /// Create Preview Environment
    ///
    /// Adds test versions of all EnvironmentObjects, Environment variables, and the ModelContext to the Preview
    func previewEnvironment(_ localize: AppLanguage = AppLanguage.en) -> some View {
        modifier(PreviewEnvironment(localize: localize.rawValue))
    }
}
```

```swift

struct MyView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.managedObjectContext) private var viewContext

    @Environment(ExampleObject.self) private var exampleObject
    var body: some View {
        Text("Hello, World!")
    }
}

#if targetEnvironment(simulator)
#Preview {
        MyView()
            .previewEnvironment()
}
#endif
```

#### But you just threw in SwiftData & CoreData!

Not to worry, the process is basically the exact same. Make preview instances for any model you have.

```swift
@MainActor
enum SDPreviewData {
    static let container: ModelContainer = {
        let schema = Schema([
            ExampleParentModel.self,
            ExampleChildModel.self,
        ])

        let modelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true, cloudKitDatabase: .private("iCloud.app.IronIQ.example"))

        do {
            let container = try ModelContainer(for: schema, configurations: modelConfiguration)
            makeExampleData(container: container)
            return container
        } catch {
            fatalError("Failed to create model container for previewing: \(error.localizedDescription)")
        }
    }()
}


extension SDPreviewData {
    /// Generates examples
    private static func makeExampleData(container: ModelContainer) {

        for exampleChild in 0 ..< 3 {
            let newChild = ExampleChild(name: "Child \(exampleChild)")
            for exampleParent in 0 ..< 2 {
                let newParent = ExampleParent(name: "Parent \(exampleParent)", child: newChild)
                container.mainContext.insert(newParent)
            }
            container.mainContext.insert(newChild)

        }

        container.mainContext.saveContext()
    }
}

```

For CoreData, Apple's boilerplate code includes a preview example you can reference, and our example .previewEnvironment has added the MOC.

Simply ensure that every new state object (such as @Observable / @ObservableObject) you create has a preview singleton in an extension, then add it to our PreviewEnvironment modifier. Every view with the modifier attached gets a correct environment!

## Other common pitfalls in the Preview Environment

As stated above, a lot of times you have a view that can has a child view with a dependency in the environment. If you don't add the .previewEnvironment() to the parent view's preview, its going to crash.

```swift
struct MyViewA: View {
    var body: some View {
        Text("Hello, World!")
        MyViewB()
    }
}

struct MyViewB: View {
    @Environment(ExampleObject.self) private var exampleObject
    var body: some View {
        HStack {
            Text("Hey back!")
            Text("from \(exampleObject.name)")
        }
    }
}


#Preview {
    MyViewA()
        .previewEnvironment()
}
```

The last common issue we'll talk about today, is previewing Views that can navigate to a view that references the environment. Just wrap the parent view in NavigationStack & attach our handy modifier.

```swift

#Preview {
    NavigationStack {
        MyView()
    }
    .previewEnvironment()
}

```

A small PS. For items that need to be passed to the view directly, you should know to just create example @State's or whatever inside the #Preview {}.

```swift

#Preview {
    NavigationStack {
        @State var exampleObject = ExampleObject.preview
        @State var exampleBinding = false

        MyDependaView(exampleObject: exampleObject, exampleBinding: $exampleBinding)
    }
    .previewEnvironment()
}

```

## The End

Once you've set up a previewEnvironment like this, its trivial to get consistent previews working across Xcode. This is by far the smoothest way I've been able to set up previews and has made [IronIQ](https://IronIQ.app) a breeze to beautify.
