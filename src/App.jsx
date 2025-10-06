import AnimatedHeader from "./ui/AnimatedHeader";

function App() {
  return (
    <>
      <div className="bg-green-900 align-top fixed top-0 w-full h-10 flex items-center justify-center">
        didymus.ai is under development
      </div>
      <div className="w-full">
        <AnimatedHeader />
      </div>
    </>
  );
}

export default App;
